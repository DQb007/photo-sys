# 提示词模板模块设计

## 目标

为 Photo Sys 增加提示词模板模块。用户可以浏览由管理员维护的提示词模板，收藏自己喜欢的模板，填写模板变量，并把最终提示词用于图片生成。

提示词库是用户侧一级页面，和“生成”“历史”处于同级导航。

## 已确认范围

- 提示词模板只由管理员维护。
- 用户在本版本不能创建、提交或申请公开提示词模板。
- 用户可以浏览启用中的模板、搜索/筛选模板、收藏模板、取消收藏、复制渲染后的提示词，以及把渲染后的提示词发送到生成页。
- 提示词变量从正文中的占位符自动识别，例如 `{主体}`、`{场景}`。
- 第一版不提供单独的变量配置 UI。
- 现有生成流程保持不变。提示词模板只负责预填现有生成页的提示词输入框。

## 非目标

- 用户提交模板和管理员审核流程。
- 用户创建私有提示词模板。
- 提示词市场、点赞、评分、评论或公开分享。
- 变量默认值或嵌套变量语法。
- 在提示词库页面直接发起图片生成。

## 数据模型

### `prompt_templates`

保存管理员维护的提示词模板。

字段：

- `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- `title VARCHAR(160) NOT NULL`
- `description VARCHAR(500) NULL`
- `prompt_text TEXT NOT NULL`
- `category VARCHAR(80) NULL`
- `status ENUM('active', 'disabled') NOT NULL DEFAULT 'active'`
- `sort_order INT NOT NULL DEFAULT 0`
- `usage_count BIGINT UNSIGNED NOT NULL DEFAULT 0`
- `created_by BIGINT UNSIGNED NULL`
- `updated_by BIGINT UNSIGNED NULL`
- `deleted_at TIMESTAMP NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

索引：

- `idx_prompt_templates_status_sort (status, sort_order, created_at)`
- `idx_prompt_templates_category (category)`
- `idx_prompt_templates_deleted_at (deleted_at)`
- `idx_prompt_templates_created_by (created_by)`
- `idx_prompt_templates_updated_by (updated_by)`

外键：

- `created_by -> users.id ON DELETE SET NULL`
- `updated_by -> users.id ON DELETE SET NULL`

### `prompt_template_favorites`

保存用户收藏关系。

字段：

- `user_id BIGINT UNSIGNED NOT NULL`
- `template_id BIGINT UNSIGNED NOT NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`

键：

- 主键或唯一键：`(user_id, template_id)`
- 索引：`idx_prompt_template_favorites_template_id (template_id)`

外键：

- `user_id -> users.id ON DELETE CASCADE`
- `template_id -> prompt_templates.id ON DELETE CASCADE`

## 可见性规则

- 管理员可以查看启用和停用的模板，包括普通用户不可见的模板。
- 普通用户只能查看 `status = 'active'` 且 `deleted_at IS NULL` 的模板。
- 如果管理员停用某个模板，用户收藏关系仍然保留。
- 第一版中，停用模板在用户提示词库和用户收藏视图中都不展示。
- 删除采用软删除；软删除模板从后台列表和用户侧列表中隐藏。

## 变量解析

变量从 `prompt_text` 的占位符中解析。

规则：

- 占位符格式：`{变量名}`。
- 变量名支持中文、英文字母、数字、下划线和短横线。
- 大括号内部前后空格会被 trim。
- 重复变量名只生成一个输入框，并替换所有同名占位符。
- 第一版中所有变量都必填。
- 存在空变量时，禁止复制和“使用并跳转生图”。
- UI 实时展示替换后的最终提示词预览。
- 不支持的模式、嵌套占位符和默认值语法会被当作普通文本或被解析器忽略。

示例：

```text
一张电影感肖像，主体是 {主体}，场景是 {场景}，使用 {光线} 光线。
```

会生成三个填写项：`主体`、`场景`、`光线`。

## 用户体验

### 导航

新增用户侧导航项“提示词库”，和“生成”“历史”“账号设置”同级。

### 提示词库页面

页面沿用当前 Photo Sys 的布局风格：

- 页面标题。
- 搜索框：搜索标题、分类、简介和提示词正文。
- 筛选控件：
  - 全部模板。
  - 我的收藏。
  - 分类筛选。
- 模板卡片网格。
- 移动端收敛为单列卡片列表和紧凑筛选控件。

模板卡片内容：

- 标题。
- 分类。
- 简介预览。
- 变量数量。
- 收藏/取消收藏操作。
- 使用操作。

本版本中，用户“自己的提示词”含义为“我的收藏模板”。

### 使用模板弹窗

点击“使用”打开弹窗：

- 展示模板标题和简介。
- 根据解析出的变量生成输入项。
- 展示实时渲染后的提示词预览。
- 提供两个动作：
  - 复制提示词：复制渲染后的提示词，并停留在提示词库页面。
  - 使用并跳转生图：把渲染后的提示词写入 `sessionStorage.reusePrompt`，然后跳转到 `/generate`。

现有 `GeneratePage` 已经读取 `sessionStorage.reusePrompt`，因此该功能应复用现有路径，不新增生成工作流。

## 管理员体验

新增后台导航项“提示词管理”。

后台页面沿用现有设置页和兑换码管理页的风格：

- 页面标题和刷新按钮。
- 新建/编辑表单。
- 模板列表或表格。
- 启用/停用状态控制。

管理员字段：

- 标题，必填。
- 分类，可选。
- 简介，可选。
- 提示词正文，必填。
- 排序值，可选数字字段。
- 状态：启用或停用。

后台列表内容：

- ID。
- 标题。
- 分类。
- 状态。
- 变量数量。
- 使用次数。
- 排序值。
- 创建/更新时间。
- 操作：编辑、启用/停用、删除。

校验：

- 标题不能为空，最长 160 个字符。
- 简介最长 500 个字符。
- 提示词正文不能为空，最长 8000 个字符。
- 排序值必须是整数。

## API 设计

### 用户侧路由

`GET /api/prompt-templates`

查询参数：

- `scope=all|favorites`，默认 `all`。
- `category`，可选。
- `search`，可选。

响应：

- `items: PromptTemplate[]`
- 每个模板包含 `isFavorite` 和 `variables`。

普通用户只会收到启用且未删除的模板。

`POST /api/prompt-templates/:id/favorite`

收藏模板。该接口幂等：重复收藏已收藏模板仍返回成功。

`DELETE /api/prompt-templates/:id/favorite`

取消收藏。该接口幂等：取消一个未收藏模板仍返回成功。

`POST /api/prompt-templates/:id/use`

增加启用模板的 `usage_count`，并返回最新序列化模板。该接口不会创建生成任务。

### 管理员路由

`GET /api/admin/prompt-templates`

列出所有未软删除模板，包括停用模板。

`POST /api/admin/prompt-templates`

创建模板。

`PATCH /api/admin/prompt-templates/:id`

更新标题、简介、提示词正文、分类、状态或排序值。

`DELETE /api/admin/prompt-templates/:id`

软删除模板。

## 审计日志

管理员操作写入审计日志：

- `prompt_templates.created`
- `prompt_templates.updated`
- `prompt_templates.enabled`
- `prompt_templates.disabled`
- `prompt_templates.deleted`

第一版不为每次用户使用模板写审计日志，因为使用行为可能很频繁。聚合统计使用 `usage_count`。

## 错误处理

- 模板 ID 不存在返回 404。
- 普通用户使用或收藏停用模板时返回 404 或 409。
- 收藏和取消收藏接口保持幂等。
- 管理员提交非法参数时，复用现有 Express 错误中间件返回校验错误。
- 软删除模板不能被更新、使用或收藏。

## 前端集成

更新 `apps/web/src/api.ts`，增加提示词模板类型和 API helper。

新增用户页面：

- `apps/web/src/pages/PromptLibraryPage.tsx`

新增后台页面：

- `apps/web/src/pages/AdminPromptTemplatesPage.tsx`

更新 `App.tsx` 中的导航和路由。

更新 `styles.css`，尽量复用现有 card、panel、table、modal、button、field 和移动端样式模式。

## 后端集成

新增迁移：

- `apps/api/db/migrations/2026-05-21-prompt-templates.sql`

更新基础 schema：

- `apps/api/db/schema.sql`

新增后端模块：

- `apps/api/src/promptTemplates.ts`

新增路由：

- `apps/api/src/routes/promptTemplates.ts`
- `apps/api/src/routes/adminPromptTemplates.ts`

在 `server.ts` 中挂载路由。

## 验证计划

运行：

- `npm run typecheck -w apps/api`
- `npm run typecheck -w apps/web`
- `npm run build`
- `npm run lint -w apps/web`

手动检查：

- 管理员可以创建启用模板。
- 用户可以在提示词库看到启用模板。
- 用户可以收藏和取消收藏模板。
- 收藏筛选只展示已收藏且启用中的模板。
- 变量弹窗要求所有变量必填。
- 渲染预览能一致替换重复占位符。
- 复制提示词能复制渲染后的提示词。
- 使用并跳转生图会进入 `/generate` 并填充 textarea。
- 管理员停用模板后，用户列表中不再展示。
- 管理员重新启用模板后，用户列表中再次展示。

## 实施备注

- 提示词模板使用行为和生成任务创建保持分离。
- 不修改 `generations` 表和积分逻辑。
- 使用现有认证中间件和管理员中间件模式。
- 收藏/取消收藏保持幂等，避免重复状态造成用户侧错误。
- 本版本刻意保持小范围，后续如果要增加用户私有模板、热门排序或审核流程，可以在不改变生成页联动路径的前提下扩展。
