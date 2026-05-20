# 任务计划：用户、权限与动态配置管理实施

## 目标

按 `docs/superpowers/specs/2026-05-20-user-permissions-design.md` 实现用户管理、图片权限隔离、邮箱验证、管理员后台、审计日志和数据库动态配置管理。

## 当前阶段

Phase 7

## 阶段

### Phase 1：计划与代码结构复核

- [x] 确认用户认可设计文档并要求继续。
- [x] 读取现有后端配置、路由、前端页面和设计文档。
- [x] 创建实施计划文件。
- **状态：complete**

### Phase 2：数据库与后端基础设施

- [x] 新增迁移：`users`、`email_verification_tokens`、`audit_logs`、`app_settings`、`generations.user_id`。
- [x] 新增配置：`JWT_SECRET`、`SETTINGS_ENCRYPTION_KEY`、`PUBLIC_APP_URL`、管理员种子配置。
- [x] 实现用户、密码哈希、JWT、审计、动态配置和邮件服务基础模块。
- [x] 实现历史数据归属到 `legacy-owner` 的迁移策略。
- **状态：complete**

### Phase 3：认证与权限 API

- [x] 实现 `/api/auth/register`、`verify-email`、`resend-verification`、`login`、`logout`、`me`。
- [x] 实现认证中间件和管理员中间件。
- [x] 改造生成接口：写入 `user_id`，按用户归属过滤、查看、重试、删除。
- [x] 改造文件接口：登录后按生成记录归属校验访问权限。
- **状态：complete**

### Phase 4：管理员 API 与动态配置 API

- [x] 实现 `/api/admin/overview`。
- [x] 实现 `/api/admin/users`、用户详情、启用禁用、角色修改、重置密码。
- [x] 实现 `/api/admin/users/:id/generations`。
- [x] 实现 `/api/admin/audit-logs`。
- [x] 实现 `/api/admin/settings` 读取、保存、默认值恢复、测试邮件。
- **状态：complete**

### Phase 5：前端认证与普通用户体验

- [x] 新增登录、注册、邮箱验证页面。
- [x] 新增 auth state 和 API token 处理。
- [x] 保护 `/generate`、`/history`、`/settings` 或迁移设置入口。
- [x] 调整生成、历史、下载等流程以处理 401、403、邮箱未验证。
- **状态：complete**

### Phase 6：管理员前端

- [x] 新增管理员导航入口。
- [x] 新增概览页。
- [x] 新增用户管理页。
- [x] 新增按用户查看生成记录页。
- [x] 新增审计日志页。
- [x] 新增动态配置页，包括注册策略、邮件配置和测试邮件。
- **状态：complete**

### Phase 7：验证、构建与提交

- [x] 运行 typecheck/build。
- [ ] 手动或脚本验证关键 API 行为。
- [x] 修复发现的问题。
- [ ] 提交实现变更。
- **状态：in_progress**

## 关键问题

1. 当前项目没有测试框架，实施时是否只用 typecheck/build 和手动 API 验证？默认先这样做。
2. 需要安装新依赖：密码哈希、JWT、邮件发送、可能的加密工具类型定义。网络受限时需要请求用户批准。
3. 现有前端中文存在终端显示乱码，但文件内容按 UTF-8 保存；后续文档和新增 UI 文案使用中文。
4. 当前 Git 需要 `-c safe.directory=D:/project/ai-code-project/photo-sys` 才能执行命令。

## 已做决策

| 决策 | 原因 |
|------|------|
| 使用项目内账号密码体系 | 与 Express + MySQL 自部署架构匹配，后续积分系统容易接入 |
| 使用通用 `app_settings` 配置表 | 后续可以低成本扩展注册、邮件、积分等运营配置 |
| 邮件密码加密存库并脱敏返回 | 满足管理员动态配置，同时避免明文泄露 |
| 数据库、Redis、OpenAI Key、JWT 密钥等保留环境变量 | 这些是启动级或核心安全配置，不适合依赖数据库管理 |
| 普通用户所有图片默认私有 | 与当前权限设计一致，降低一期范围和安全风险 |

## 错误记录

| 错误 | 尝试 | 处理 |
|------|------|------|
| 无 | 1 | 暂无 |
