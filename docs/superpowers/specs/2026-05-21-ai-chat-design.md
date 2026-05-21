# AI 对话模块设计

## 目标

为炫步 AI 增加独立的通用 AI 对话模块。登录用户可以创建和继续多轮对话，查看自己的对话历史，选择后台启用的 AI 对话模型，并通过流式输出获得接近 ChatGPT 的实时回复体验。

第一版定位为通用聊天助手，不和图片生成、生成历史、提示词库产生业务联动。

## 已确认范围

- 普通用户和管理员都可以使用 AI 对话模块。
- 所有用户只能查看和管理自己的对话历史。
- 管理员第一版不能查看、搜索或删除其他用户的对话内容。
- 对话历史持久化保存。
- 用户可以新建会话、继续会话、重命名会话、删除会话。
- AI 回复必须支持流式输出。
- AI 对话使用独立模型配置，不复用图片生成的 `OPENAI_BASE_URL`、`OPENAI_API_KEY` 和 `IMAGE_MODEL`。
- 后台支持配置多个 AI 对话模型。
- 用户端可以在发送消息前切换已启用模型。
- 对话按每条用户消息固定扣积分，扣费值由后台动态配置。
- 每条消息积分消耗配置为 `0` 时，AI 对话免费使用。

## 非目标

- 不在对话中读取图片生成历史。
- 不在对话中引用、分析或上传图片。
- 不从对话中直接发起图片生成任务。
- 不提供“复制到提示词”或“发送到生图页”的快捷联动。
- 不做 token 级别计费。
- 不做管理员全量对话审查。
- 不做多租户模型权限分组。
- 不做会话分享、公开链接或协作对话。

## 导航与页面结构

全局左侧导航只新增一个一级入口：`AI 对话`。

不新增单独的“对话历史”全局导航项。对话历史属于 AI 对话模块内部状态，避免和现有“生成历史”混淆。

桌面端页面结构：

```text
全局侧边栏 | AI 对话页内部会话列表 | 当前聊天窗口
```

移动端页面结构：

```text
顶部栏 / 当前聊天窗口 / 历史抽屉
```

会话列表提供：

- 新建会话
- 会话标题
- 最近更新时间
- 当前会话高亮
- 重命名
- 删除

聊天区提供：

- 当前会话标题
- 模型选择器
- 消息列表
- 流式回复状态
- 输入框
- 发送按钮
- 停止生成按钮
- 积分消耗提示

## 用户体验

### 新建会话

用户点击“新建对话”后创建空会话。默认标题为“新对话”。

用户发送第一条消息成功后，如果会话标题仍是默认标题，后端使用第一条用户消息前 30 个字符生成自动标题。用户手动重命名后，不再被自动标题覆盖。

### 发送消息

发送流程：

1. 用户选择模型并输入消息。
2. 前端校验输入不能为空，且不超过后台配置的最大字符数。
3. 前端立即在本地消息列表中展示用户消息。
4. 前端创建 assistant 回复占位。
5. 前端调用 SSE 流式接口。
6. 后端检查会话归属、对话开关、模型状态和积分余额。
7. 后端保存用户消息。
8. 后端按配置扣除积分；配置为 `0` 时跳过扣费。
9. 后端调用所选模型的上游聊天接口。
10. 前端收到分片后持续追加 assistant 内容。
11. 流式完成后，后端保存完整 assistant 消息并返回完成事件。
12. 前端刷新会话列表、消息状态和积分余额。

### 模型切换

模型选择器读取后台启用模型列表。默认选中后台设置的默认启用模型。

模型切换按“下一条发送消息”生效，而不是锁定整个会话。同一个会话允许不同消息使用不同模型。

每条 assistant 消息展示当次使用的模型名称。

### 停止生成

前端提供“停止生成”按钮。用户停止后，前端关闭 SSE 连接。

后端应尽量中止上游请求，并将 assistant 消息标记为 `cancelled` 或 `failed`。如果本次已经扣积分，按失败处理并退回积分。

第一版把用户主动停止、上游超时和上游错误都视为未完成回复，执行退费。

## 数据模型

### `chat_conversations`

保存用户对话会话。

字段：

- `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- `user_id BIGINT UNSIGNED NOT NULL`
- `title VARCHAR(160) NOT NULL`
- `title_is_auto TINYINT(1) NOT NULL DEFAULT 1`
- `status ENUM('active', 'deleted') NOT NULL DEFAULT 'active'`
- `last_message_at TIMESTAMP NULL`
- `deleted_at TIMESTAMP NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

索引：

- `idx_chat_conversations_user_updated (user_id, updated_at)`
- `idx_chat_conversations_user_status_last_message (user_id, status, last_message_at)`

外键：

- `user_id -> users.id ON DELETE RESTRICT`

### `chat_messages`

保存对话消息。

字段：

- `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- `conversation_id BIGINT UNSIGNED NOT NULL`
- `user_id BIGINT UNSIGNED NOT NULL`
- `role ENUM('user', 'assistant', 'system') NOT NULL`
- `content MEDIUMTEXT NOT NULL`
- `status ENUM('streaming', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'completed'`
- `error_message TEXT NULL`
- `chat_model_id BIGINT UNSIGNED NULL`
- `model_name_snapshot VARCHAR(160) NULL`
- `model_key_snapshot VARCHAR(160) NULL`
- `credit_cost INT UNSIGNED NOT NULL DEFAULT 0`
- `credit_transaction_id BIGINT UNSIGNED NULL`
- `metadata_json JSON NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

索引：

- `idx_chat_messages_conversation_created (conversation_id, created_at)`
- `idx_chat_messages_user_created (user_id, created_at)`
- `idx_chat_messages_model (chat_model_id)`
- `idx_chat_messages_credit_transaction (credit_transaction_id)`

外键：

- `conversation_id -> chat_conversations.id ON DELETE CASCADE`
- `user_id -> users.id ON DELETE RESTRICT`
- `chat_model_id -> chat_models.id ON DELETE SET NULL`
- `credit_transaction_id -> credit_transactions.id ON DELETE SET NULL`

### `chat_models`

保存后台维护的 AI 对话模型配置。

字段：

- `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- `name VARCHAR(160) NOT NULL`
- `model_key VARCHAR(160) NOT NULL`
- `base_url VARCHAR(1000) NOT NULL`
- `api_key_encrypted TEXT NULL`
- `status ENUM('active', 'disabled') NOT NULL DEFAULT 'active'`
- `is_default TINYINT(1) NOT NULL DEFAULT 0`
- `sort_order INT NOT NULL DEFAULT 0`
- `description VARCHAR(500) NULL`
- `created_by BIGINT UNSIGNED NULL`
- `updated_by BIGINT UNSIGNED NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

索引：

- `idx_chat_models_status_sort (status, sort_order, created_at)`
- `idx_chat_models_default (is_default, status)`
- `idx_chat_models_created_by (created_by)`
- `idx_chat_models_updated_by (updated_by)`

外键：

- `created_by -> users.id ON DELETE SET NULL`
- `updated_by -> users.id ON DELETE SET NULL`

约束：

- 第一版通过后端事务保证同一时间只有一个启用模型为默认模型。
- 如果管理员将某个模型设为默认模型，后端自动取消其他模型的默认标记。
- 如果默认模型被停用，后端要求管理员先指定新的启用默认模型，或用户端进入不可发送状态。

## 设置项

使用现有 `app_settings` 保存全局 AI 对话设置。

新增设置：

- `chat.enabled`：是否启用 AI 对话。
- `chat.messageCreditCost`：每条用户消息消耗积分，整数，允许 `0`。
- `chat.systemPrompt`：全局系统提示词，可为空。
- `chat.maxInputChars`：单条用户输入最大字符数。
- `chat.maxHistoryMessages`：请求上游时携带的历史消息上限。
- `chat.requestTimeoutMs`：上游请求超时时间。

不在 `app_settings` 保存单一 `chat.model`，模型改由 `chat_models` 管理。

## 积分扣费

扣费单位为“用户发送一条消息”。

规则：

- `chat.messageCreditCost = 0` 时免费，不创建扣费流水。
- `chat.messageCreditCost > 0` 时，发送前检查用户余额。
- 余额不足时返回 402 或 409，不创建用户消息。
- 扣费成功后创建 `credit_transactions` 记录。
- 用户消息和 assistant 消息都记录本次 `credit_cost`，assistant 消息关联扣费流水。
- 上游请求失败、超时、用户停止生成或流式中断时，退回本次扣除积分。
- 退费复用现有积分流水模式，新增交易类型 `chat_message_refund`。

需要扩展 `credit_transactions.type`：

- 新增 `chat_message_debit`
- 新增 `chat_message_refund`

扣费 metadata 建议包含：

```json
{
  "conversationId": 1,
  "userMessageId": 10,
  "assistantMessageId": 11,
  "chatModelId": 2,
  "modelKey": "gpt-4.1"
}
```

## 后端模块

新增模块：

- `apps/api/src/chatModels.ts`
- `apps/api/src/chatConversations.ts`
- `apps/api/src/chatRelay.ts`
- `apps/api/src/routes/chat.ts`
- `apps/api/src/routes/adminChatModels.ts`
- `apps/api/src/routes/adminChatSettings.ts`

更新模块：

- `apps/api/src/server.ts`
- `apps/api/src/db.ts`
- `apps/api/src/credits.ts`
- `apps/api/src/settingsService.ts`
- `apps/api/src/routes/admin.ts` 或后台设置路由挂载处

## API 设计

### 用户侧

`GET /api/chat/models`

返回启用模型列表和默认模型。

响应：

- `items`
- `defaultModelId`

模型只返回非敏感字段：

- `id`
- `name`
- `modelKey`
- `description`
- `isDefault`

`GET /api/chat/settings`

返回用户端需要知道的对话设置：

- `enabled`
- `messageCreditCost`
- `maxInputChars`
- `maxHistoryMessages`

不返回系统提示词和密钥。

`GET /api/chat/conversations`

列出当前用户未删除会话，按 `last_message_at` 和 `updated_at` 倒序。

`POST /api/chat/conversations`

创建新会话。

请求：

- `title` 可选。

`PATCH /api/chat/conversations/:id`

重命名当前用户自己的会话。

请求：

- `title`

重命名后设置 `title_is_auto = 0`。

`DELETE /api/chat/conversations/:id`

软删除当前用户自己的会话。

`GET /api/chat/conversations/:id/messages`

读取当前用户自己的会话消息。

`POST /api/chat/conversations/:id/messages/stream`

发送用户消息，并通过 SSE 返回 assistant 回复。

请求：

```json
{
  "content": "你好",
  "chatModelId": 1
}
```

SSE 事件：

- `message_created`：返回用户消息和 assistant 占位消息。
- `delta`：返回增量文本。
- `completed`：返回完整 assistant 消息、会话摘要和最新积分余额。
- `failed`：返回错误、assistant 消息状态和退费结果。

### 管理员侧

`GET /api/admin/chat-settings`

读取 AI 对话设置。

`PATCH /api/admin/chat-settings`

更新 AI 对话设置。

`GET /api/admin/chat-models`

列出所有对话模型，包括停用模型。

`POST /api/admin/chat-models`

创建模型。

`PATCH /api/admin/chat-models/:id`

更新模型。

`DELETE /api/admin/chat-models/:id`

软停用或删除模型。第一版建议使用停用，不物理删除。

`POST /api/admin/chat-models/:id/test`

测试模型连接。后端用该模型发起一次轻量聊天请求，返回成功或失败原因。

## 上游请求

`chatRelay.ts` 负责调用上游聊天接口。

第一版按 OpenAI 兼容接口设计：

- `POST {baseUrl}/v1/chat/completions`
- 请求体包含 `model`、`messages`、`stream: true`
- 使用模型自己的 API Key。

请求消息组成：

1. 可选全局 `systemPrompt`。
2. 当前会话最近 `chat.maxHistoryMessages` 条已完成消息。
3. 本次用户消息。

只携带 `completed` 状态消息。失败、中止、空内容消息不发给上游。

## 错误处理

- 用户未登录：401。
- 用户未激活：403，复用现有 `requireActiveUser`。
- AI 对话关闭：409，返回 `CHAT_DISABLED`。
- 未配置启用模型：409，返回 `CHAT_MODEL_REQUIRED`。
- 所选模型不存在或已停用：409，返回 `CHAT_MODEL_UNAVAILABLE`。
- 模型缺少 API Key：409，返回 `CHAT_MODEL_NOT_CONFIGURED`。
- 输入为空或超过长度：400。
- 余额不足：409，返回 `INSUFFICIENT_CREDITS`。
- 会话不存在或不属于当前用户：404。
- 上游超时：assistant 消息标记 `failed`，退费。
- 上游错误：assistant 消息标记 `failed`，保存错误摘要，退费。
- 流式中断：assistant 消息保留已收到内容，标记 `failed` 或 `cancelled`，退费。

错误摘要最多保存 500 字符，避免数据库写入过大的上游错误。

## 审计日志

管理员操作写入审计日志：

- `chat_models.created`
- `chat_models.updated`
- `chat_models.enabled`
- `chat_models.disabled`
- `chat_models.default_changed`
- `chat_settings.updated`
- `chat_models.tested`

普通用户发送聊天消息第一版不写审计日志，避免高频日志膨胀。消息本身已经落库。

## 前端集成

更新：

- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/styles.css`

新增：

- `apps/web/src/pages/ChatPage.tsx`
- `apps/web/src/pages/AdminChatModelsPage.tsx`
- `apps/web/src/pages/AdminChatSettingsPage.tsx`

导航：

- 普通用户导航新增 `AI 对话`。
- 管理员导航新增 `AI 对话` 或在普通业务入口中同样展示。
- 管理员后台新增 `对话设置` 和 `对话模型` 管理入口；也可以合并为一个 `AI 对话管理` 页面，内部用分区或 tabs。

前端 API helper：

- `listChatModels`
- `getChatSettings`
- `listChatConversations`
- `createChatConversation`
- `updateChatConversation`
- `deleteChatConversation`
- `listChatMessages`
- `streamChatMessage`
- `getAdminChatSettings`
- `updateAdminChatSettings`
- `listAdminChatModels`
- `createAdminChatModel`
- `updateAdminChatModel`
- `disableAdminChatModel`
- `testAdminChatModel`

SSE 客户端实现：

- 使用 `fetch` 读取 `ReadableStream`，而不是 `EventSource`，因为需要 POST 请求和 Authorization header。
- 前端解析 SSE 帧。
- 支持 `AbortController` 停止生成。

## 移动端适配

- 全局移动端导航沿用现有汉堡菜单。
- AI 对话页内部会话列表在移动端收起。
- 聊天页顶部显示“历史”按钮。
- 输入框固定在聊天区底部，不遮挡消息列表。
- 模型选择器在移动端压缩为单行 select。
- 长消息换行显示，避免横向溢出。

## 安全与隐私

- 所有用户侧接口必须通过 `requireUser`。
- 发送消息必须通过 `requireActiveUser`。
- 所有会话和消息查询都必须校验 `user_id`。
- 管理员模型管理接口必须通过 `requireAdmin`。
- API Key 加密保存，后台列表只显示是否已配置，不返回明文。
- 测试连接接口不返回上游完整错误体，只返回短错误摘要。
- SSE 接口不能把密钥、完整请求头或内部栈信息返回给前端。

## 数据迁移

新增迁移：

- `apps/api/db/migrations/2026-05-21-ai-chat.sql`

迁移内容：

- 创建 `chat_models`
- 创建 `chat_conversations`
- 创建 `chat_messages`
- 扩展 `credit_transactions.type`，加入 `chat_message_debit` 和 `chat_message_refund`
- 插入默认 `app_settings` 聊天配置

同步更新：

- `apps/api/db/schema.sql`

## 验证计划

命令验证：

- `npm run typecheck -w apps/api`
- `npm run typecheck -w apps/web`
- `npm run build`
- `npm run lint -w apps/web`

手动验证：

- 管理员创建 AI 对话模型。
- 管理员设置默认模型。
- 管理员停用模型后，用户端不可选择该模型。
- 用户进入 AI 对话页可以看到默认模型。
- 用户可以切换模型并发送消息。
- 流式回复能持续追加内容。
- 同一会话中不同消息能显示不同模型名称。
- 会话自动生成标题。
- 用户可以手动重命名会话。
- 用户可以删除会话，删除后列表不显示。
- 配置每条消息消耗为 `0` 时，发送不扣积分。
- 配置每条消息消耗大于 `0` 时，发送成功扣积分。
- 余额不足时不能发送，且不创建消息。
- 上游失败时退回积分。
- 用户停止生成时退回积分。
- 移动端会话历史抽屉可正常打开和关闭。

## 实施备注

- 第一版应优先保证通用聊天闭环，不引入图片生成联动。
- 对话模型管理需要和现有设置加密能力保持一致。
- 流式接口的数据库写入要避免每个 token 都写库；应在内存中累积，完成或失败时写入最终内容。
- 如果服务进程在流式过程中崩溃，可能留下 `streaming` 状态消息。后续可以在启动时或列表读取时将过旧 `streaming` 消息标记为 `failed`。
- 用户停止生成在 HTTP 层不一定能可靠通知后端完成清理，后端需要监听请求关闭事件并尽量执行状态更新和退费。
- 后续如需扩展图像工作流助手，可以在不改变本模块基础表结构的前提下新增附件表和工具调用表。
