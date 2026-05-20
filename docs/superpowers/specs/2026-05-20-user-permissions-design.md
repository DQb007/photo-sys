# Photo Sys 用户与图片权限管理设计

日期：2026-05-20

## 目标

在现有 Photo Sys 图片生成网站中加入用户管理和私有图片权限。当前系统是单用户的 Vite + React 前端与 Express + MySQL 后端。本设计增加公开注册、邮箱验证、登录、基于角色的访问控制、按用户隔离的生成历史、私有文件访问、管理员用户管理、轻量统计和审计日志。

本阶段不实现积分、计费、公开分享、团队空间、图表、导出或第三方登录。数据模型需要为后续积分系统留下清晰扩展点，后续可以在用户创建图片生成任务时扣减积分。

## 已确认决策

- 权限模型：普通用户只能查看、下载、重试和删除自己的图片生成记录。
- 管理员权限：管理员可以管理用户，并查看、删除、重试所有生成记录。
- 注册方式：允许公开注册。
- 邮箱验证：注册后发送一次性邮箱验证链接，验证后账号才可用。
- 管理员初始化：通过环境变量种子创建或更新第一个管理员账号。
- 图片分享：本阶段不做公开分享，也不做登录用户内共享。所有生成记录和文件均为私有。
- 管理后台范围：包括用户管理、按用户查看生成记录、轻量概览指标和审计日志列表。
- 认证方式：项目内置邮箱密码登录，API 使用 JWT 鉴权。

## 架构

后端继续作为身份、角色、资源归属和文件权限的唯一权威。前端保存登录令牌，并在 API 请求中携带令牌。后端中间件负责认证请求，在需要时拒绝禁用或未验证用户，并在返回生成记录或文件前执行归属校验。

新增后端模块：

- `auth`：注册、邮箱验证、登录、登出、当前用户、重发验证邮件。
- `users`：用户持久化、密码哈希、角色和状态校验、管理员种子。
- `mail`：基于 SMTP 发送验证邮件，开发环境可降级为打印验证链接。
- `permissions`：生成记录归属和管理员检查的复用工具。
- `audit`：用户和管理员关键操作的轻量审计事件。
- `admin`：受保护的用户管理、统计、按用户查看生成记录和审计日志接口。

新增前端路由：

- `/login`
- `/register`
- `/verify-email`
- `/admin/overview`
- `/admin/users`
- `/admin/users/:id/generations`
- `/admin/audit-logs`

现有 `/generate`、`/history` 和 `/settings` 变为登录后可访问路由。只有当前登录用户角色为 `admin` 时，侧边栏才显示管理员入口。

## 用户模型与认证

用户使用邮箱、密码和可选昵称注册。注册时，后端创建角色为 `user`、状态为 `pending_email_verification` 的用户，保存安全密码哈希，创建一次性验证 token，并发送验证邮件。数据库只保存发送链接中 token 的哈希值。验证 token 建议 24 小时过期，并在成功使用后失效。

用户点击验证链接后，状态变为 `active`。只有 `active` 用户可以登录和创建生成任务。如果未验证用户尝试登录，API 返回明确错误，让前端展示重新发送验证邮件的操作。

角色：

- `user`：只能创建和管理自己的生成记录。
- `admin`：可以管理用户和所有生成记录。

状态：

- `pending_email_verification`：已注册但未验证邮箱，不能登录或创建任务。
- `active`：可以登录和使用允许的功能。
- `disabled`：不能登录或使用 API；已有数据保留，供管理员审核。

认证使用 JWT access token。token 至少包含 `sub`、`email`、`role`，并配合 token version 或数据库状态检查策略。受保护接口需要从数据库加载当前用户，这样即使旧 token 仍未过期，禁用用户也会被拦截。第一版可以只使用带过期时间的单一 access token；token 过期后用户重新登录。

密码使用 `bcrypt` 或 `argon2` 等安全哈希算法。明文密码不得保存，也不得写入日志。

## 管理员初始化

后端支持如下环境变量：

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace_me
ADMIN_NAME=Administrator
```

后端启动时或通过初始化命令创建管理员用户。如果管理员用户已存在，确保其角色为 `admin`、状态为 `active`。密码更新行为需要在实现中明确，避免因为环境变量残留而静默覆盖管理员密码；更稳妥的方式是只在专门初始化命令中允许更新密码。

## 邮箱验证

生产环境注册要求邮件配置完整：

```env
PUBLIC_APP_URL=https://photo.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=mailer@example.com
SMTP_PASS=replace_me
MAIL_FROM="Photo Sys <mailer@example.com>"
```

验证链接指向前端，例如：

```text
{PUBLIC_APP_URL}/verify-email?token={rawToken}
```

前端把 token 提交给后端验证接口。后端对原始 token 做哈希，查找未过期且未使用的匹配 token，激活用户，失效该 token，并写入审计日志。

开发环境中，如果 SMTP 未配置，后端可以把验证链接打印到日志。生产环境中，SMTP 配置缺失时应禁止注册，并返回清晰的运维错误。

重复使用已存在邮箱注册时，应避免泄露账号是否存在。API 可以返回通用提示；如果账号处于未验证状态，可以触发重新发送验证邮件流程。

## 数据模型

### `users`

- `id`
- `email`
- `display_name`
- `password_hash`
- `role`：`user` 或 `admin`
- `status`：`pending_email_verification`、`active` 或 `disabled`
- `email_verified_at`
- `last_login_at`
- `created_at`
- `updated_at`

邮箱入库前需要标准化，并建立唯一索引。

### `email_verification_tokens`

- `id`
- `user_id`
- `token_hash`
- `expires_at`
- `used_at`
- `created_at`

只有未过期且未使用的 token 有效。

### `audit_logs`

- `id`
- `actor_user_id`
- `actor_email`
- `action`
- `target_type`
- `target_id`
- `target_user_id`
- `metadata_json`
- `ip_address`
- `user_agent`
- `created_at`

审计元数据应保持小而明确，不得包含密码、API Key、原始验证 token 或其他敏感信息。

### 现有表调整

`generations` 新增：

- `user_id BIGINT UNSIGNED NOT NULL`

`generation_images` 继续关联 `generations`。文件权限通过所属生成记录判断，不在每张图片行中重复保存 `user_id`。

推荐索引：

- `users.email`
- `users.role`
- `users.status`
- `generations.user_id`
- `generations.user_id, created_at`
- `audit_logs.created_at`
- `audit_logs.actor_user_id`
- `audit_logs.target_user_id`
- `audit_logs.action`

## 历史数据迁移

现有生成记录没有用户归属。迁移时创建一个 `legacy-owner` 用户，建议使用管理员角色或清晰标记为系统账号，然后把现有 `generations.user_id` 全部指向该用户。这样不会出现无主图片，管理员仍可查看和删除旧图片。

迁移顺序：

1. 创建用户相关表。
2. 创建或查找 `legacy-owner` 用户。
3. 给 `generations` 增加可空 `user_id`。
4. 将现有记录回填到 `legacy-owner`。
5. 将 `generations.user_id` 改为 `NOT NULL`。
6. 添加外键和索引。

## 生成记录与文件权限

`POST /api/generations` 要求用户已登录且状态为 `active`。后端创建生成记录时写入当前用户的 `user_id`。参考图仍可存储在当前上传目录下，但访问权限由所属生成记录控制。

普通用户行为：

- `GET /api/generations`：只返回当前用户的记录。
- `GET /api/generations/:id`：只允许访问自己的记录。
- `POST /api/generations/:id/retry`：只允许重试自己的记录。
- `DELETE /api/generations/:id`：只允许删除自己的记录。

管理员行为：

- 管理员可以列出全部生成记录，也可以按用户过滤。
- 管理员可以查看、重试和删除任意生成记录。

文件访问行为：

- `/files/:folder/:filename` 要求登录。
- 后端解析 storage key 后，反查该文件是否属于 `generation_images.file_path` 或 `generations.reference_image_path`。
- 只有生成记录所有者或管理员可以访问。
- 匿名用户返回 `401`。
- 已登录但无权限返回 `403`。
- 文件不存在、路径非法或文件没有数据库归属时返回 `404`。

当前存储层已有的路径穿越防护仍必须保留。

## 管理员功能

### 概览

`/admin/overview` 展示轻量运维指标：

- 用户总数。
- 活跃用户数。
- 待邮箱验证用户数。
- 禁用用户数。
- 生成任务总数。
- 成功、失败、排队中、生成中的任务数量。
- 生成图片数量。

本阶段不包括图表、趋势分析、CSV 导出或存储空间分析。

### 用户列表

`/admin/users` 支持：

- 按邮箱或昵称搜索。
- 按角色和状态筛选。
- 展示角色、状态、邮箱验证状态、最近登录时间、创建时间、生成次数、成功次数、失败次数和图片数量。
- 启用或禁用用户。
- 提升为管理员或降级为普通用户。
- 重置密码或创建临时密码流程。
- 重新发送验证邮件。
- 打开指定用户的生成历史。

需要包含自我保护规则：管理员不能禁用或降级系统中唯一一个活跃管理员账号。

### 按用户查看生成记录

`/admin/users/:id/generations` 允许管理员查看某个用户的生成历史，使用与普通历史页一致的预览和删除交互，但数据范围限定为选中用户。

### 审计日志

`/admin/audit-logs` 展示审计事件列表，并支持过滤：

- 操作类型。
- 操作者。
- 目标用户。
- 时间范围。

记录的事件包括：

- 注册请求。
- 验证邮件已发送。
- 邮箱验证成功。
- 登录成功。
- 登录失败。
- 登出。
- 创建生成任务。
- 重试生成任务。
- 删除生成任务。
- 启用用户。
- 禁用用户。
- 修改角色。
- 重置密码。
- 重新发送验证邮件。

## API 范围

### 认证接口

- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 生成接口

现有接口保留，但都需要登录并执行归属校验：

- `POST /api/generations`
- `GET /api/generations`
- `GET /api/generations/meta/summary`
- `GET /api/generations/:id`
- `POST /api/generations/:id/retry`
- `DELETE /api/generations/:id`

普通用户访问 summary 时只返回自己的统计；管理员可以支持全局统计。

### 管理员接口

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/reset-password`
- `POST /api/admin/users/:id/resend-verification`
- `GET /api/admin/users/:id/generations`
- `GET /api/admin/audit-logs`

## 前端行为

未登录访问受保护路由时跳转到 `/login`。登录成功后保存 token 和当前用户状态，并跳转到 `/generate`。注册成功后展示“请检查邮箱”的页面。邮箱验证成功后跳转到登录页；如果实现选择验证后直接返回 token，也可以自动登录。

主导航只对管理员显示管理入口。现有 `/settings` 页面保持登录后访问。如果该页展示运维配置，建议设为管理员专用；如果只展示非敏感状态，也可以对普通用户开放有限信息，具体实现时根据页面内容决定。

前端 API 层统一处理：

- `401`：清除 token 并跳转登录页。
- `403`：展示无权限提示。
- 邮箱未验证：展示专门提示和重新发送验证邮件操作。
- 表单校验错误：展示表单级错误。

## 错误处理

统一 HTTP 状态：

- `401`：缺少、无效或过期 token。
- `403`：已登录但无权限，包括禁用用户。
- `404`：资源不存在、文件 key 非法或文件没有合法数据库归属。
- `409`：状态冲突，例如邮箱已注册或非法状态转换。
- `422`：表单数据无效。
- `500`：未预期的服务器错误。

邮件发送失败等运维错误需要便于管理员诊断，但不能暴露 SMTP 密码或原始 token。

## 安全要求

- 邮箱标准化并建立唯一索引。
- 只存储密码哈希。
- 只存储验证 token 哈希。
- 不记录明文密码、API Key、JWT 或验证 token。
- 受保护请求需要从数据库检查用户状态。
- 所有文件路由都要做归属校验。
- 保留路径穿越防护。
- 注册和重发验证邮件流程避免账号枚举。
- CORS 与前端来源配置需要符合部署模型。
- 管理员操作必须写入审计日志。

## 测试策略

后端测试覆盖：

- 注册新用户会创建待验证用户和验证 token。
- 验证邮件链接可以激活账号。
- 过期或重复使用的验证 token 会失败。
- 待验证用户可以重新发送验证邮件。
- 只有激活用户可以登录。
- 禁用用户不能登录或访问受保护 API。
- 普通用户不能访问管理员接口。
- 管理员接口拒绝普通用户。
- 生成记录创建时写入 `user_id`。
- 普通用户只能列出、查看、重试和删除自己的记录。
- 管理员可以列出、查看、重试和删除所有记录。
- 文件路由拒绝匿名访问。
- 文件路由拒绝跨用户访问。
- 文件路由允许所有者和管理员访问。
- 路径穿越请求被拒绝。
- 关键操作写入审计日志。
- 历史迁移会把旧记录归属到 `legacy-owner`。

前端测试或手动验证覆盖：

- 注册、邮箱验证、登录、登出。
- 未验证用户登录时展示验证引导。
- 未登录访问受保护路由会跳转登录页。
- 管理员导航只对管理员显示。
- 历史页只展示当前用户记录。
- 管理员用户列表筛选和操作可用。
- 管理员按用户查看生成记录可用。
- 审计日志筛选渲染符合预期。

## 暂不实现

- 积分、计费和额度控制。
- 公开分享链接。
- 团队或项目空间。
- 第三方登录。
- 用户自助找回密码，管理员重置或临时密码流程除外。
- 复杂图表、导出或长期分析。
- 对象存储迁移。
