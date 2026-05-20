# Photo Sys 积分额度模块设计

日期：2026-05-21

## 目标

在现有 Photo Sys 用户、权限、生成记录和后台管理基础上加入积分额度模块。用户拥有积分余额，创建图片生成任务时按后台配置扣积分，生成失败时可自动退积分，管理员可以在后台调整用户积分并填写原因。所有积分变化都写入流水，便于用户查看和管理员审计。

本阶段不实现用户自助充值、支付订单、套餐售卖、优惠券、团队共享额度、积分过期、复杂阶梯计价或财务报表。

## 已确认决策

- 积分来源只包括：新用户初始发放、生成图片扣费、生成失败退款、管理员后台调整。
- 普通用户只能查看自己的余额和积分流水，不能自行修改积分。
- 管理员可以在后台给用户加减积分，调整时必须填写原因。
- 生图扣积分规则支持后台动态配置。
- 第一版按图片张数固定计费：`本次消耗 = count * credits.costPerImage`。
- 默认每张图消耗 1 积分。
- 生成失败默认退还本次任务扣除的积分。
- 重试失败任务会创建新任务，并按当前配置重新扣积分。
- 积分流水记录实际扣费金额，不受后续配置变更影响。

## 推荐方案

采用“余额字段 + 流水表”的混合模型：

- `users.credit_balance` 保存当前可用余额，用于快速展示和扣费校验。
- `credit_transactions` 保存每一次积分变化，作为审计和追溯依据。

只保存余额会缺少审计能力；只靠流水实时汇总余额会增加每次生成前的查询成本。混合模型更适合当前项目：读余额快，流水完整，后续也方便接入充值或报表。

## 数据模型

### `users` 调整

新增字段：

- `credit_balance INT UNSIGNED NOT NULL DEFAULT 0`

余额不允许为负数。后端所有修改余额的路径都必须在数据库事务中完成。

### `credit_transactions`

新增表：

- `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`
- `user_id BIGINT UNSIGNED NOT NULL`
- `type ENUM('initial_grant', 'admin_adjustment', 'generation_debit', 'generation_refund') NOT NULL`
- `amount INT NOT NULL`
- `balance_after INT UNSIGNED NOT NULL`
- `generation_id BIGINT UNSIGNED NULL`
- `actor_user_id BIGINT UNSIGNED NULL`
- `reason VARCHAR(500) NULL`
- `metadata_json JSON NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`

索引：

- `idx_credit_transactions_user_created_at (user_id, created_at)`
- `idx_credit_transactions_generation_id (generation_id)`
- `idx_credit_transactions_actor_user_id (actor_user_id)`
- `idx_credit_transactions_type (type)`

约束：

- `user_id` 外键到 `users.id`。
- `generation_id` 外键到 `generations.id`，删除策略建议 `ON DELETE SET NULL`，因为生成记录软删除后流水仍需保留。
- `actor_user_id` 外键到 `users.id`，删除策略建议 `ON DELETE SET NULL`。

`amount` 规则：

- 正数表示加积分。
- 负数表示扣积分。
- `balance_after` 记录本次变更后的余额，方便审计和显示。

### `generations` 调整

新增字段：

- `credit_cost INT UNSIGNED NOT NULL DEFAULT 0`
- `credit_refunded_at TIMESTAMP NULL`

`credit_cost` 记录创建任务时实际扣除的积分。生成失败退款时按这个字段退回，避免后续动态配置变更影响历史任务。

## 动态配置

沿用现有 `app_settings` 和 `settingsService`，新增 `credits` 分组：

- `credits.enabled`：是否启用积分扣费，默认 `true`。
- `credits.costPerImage`：每张图片消耗积分，默认 `1`，建议范围 `0` 到 `100000`。
- `credits.initialBalance`：新用户注册初始积分，默认 `0`，建议范围 `0` 到 `1000000`。
- `credits.refundOnFailure`：生成失败是否自动退款，默认 `true`。

扣费公式：

```text
creditCost = count * credits.costPerImage
```

如果 `credits.enabled = false`，创建生成任务不检查余额，也不扣积分，`generations.credit_cost = 0`。

`credits.costPerImage = 0` 可作为临时免费生成策略，仍保留配置开关，便于管理员区分“关闭积分模块”和“积分模块开启但当前免费”。

## 后端流程

### 注册初始积分

创建新用户后，读取 `credits.initialBalance`。如果大于 0，在同一业务流程中：

1. 增加用户 `credit_balance`。
2. 写入 `credit_transactions`，类型为 `initial_grant`。
3. 审计日志可记录 `credits.initial_granted`，不记录敏感信息。

如果注册要求邮箱验证，初始积分仍在用户创建时发放。待验证用户不能登录或创建任务，因此不会提前消耗。

### 创建生成任务扣费

`POST /api/generations` 在校验用户为 active 后执行：

1. 解析表单参数，得到 `count`。
2. 读取积分配置，计算 `creditCost`。
3. 开启 MySQL 事务。
4. 使用 `SELECT ... FOR UPDATE` 锁定当前用户行。
5. 如果启用积分且余额不足，回滚事务并返回 `409 INSUFFICIENT_CREDITS`。
6. 扣减 `users.credit_balance`。
7. 插入 `generations`，写入 `credit_cost`。
8. 插入 `credit_transactions`，类型为 `generation_debit`，关联 `generation_id`。
9. 提交事务。
10. 事务提交后再调用 `enqueueGeneration(generationId)`。
11. 写入现有 `generation.created` 审计日志，metadata 可包含 `creditCost`。

事务必须覆盖扣余额、生成记录和积分流水，避免出现不一致。

如果 Redis 入队失败，此时任务已创建且已扣积分。后端应返回错误并保留任务为 `pending`，管理员或后续补偿机制可以重新入队。第一版可接受该残余风险，但需要在测试中覆盖错误提示；后续可加入 pending 任务重扫。

### 生成失败退款

`processGeneration()` 在任务失败分支里，如果满足以下条件则自动退款：

- `credits.refundOnFailure = true`
- `generation.credit_cost > 0`
- `generation.credit_refunded_at IS NULL`

退款流程使用事务：

1. 锁定 `generations` 行，确认尚未退款。
2. 锁定用户行。
3. 增加 `users.credit_balance`。
4. 更新 `generations.credit_refunded_at = NOW()`。
5. 插入 `credit_transactions`，类型为 `generation_refund`，关联 `generation_id`。
6. 写入审计日志 `credits.generation_refunded`。

该流程要做幂等保护，避免 worker 重试或异常重复退款。

### 管理员调整积分

新增接口：

- `POST /api/admin/users/:id/credits/adjust`

请求体：

```json
{
  "amount": 100,
  "reason": "活动赠送"
}
```

规则：

- `amount` 不能为 0。
- `reason` 必填，长度限制 1 到 500。
- 调整后余额不能小于 0。
- 管理员可以给自己调整积分，但必须写流水和审计日志。
- 禁用用户仍可被管理员调整积分，数据保留。

响应返回更新后的用户余额和本次流水。

### 查询积分

新增普通用户接口：

- `GET /api/credits/balance`
- `GET /api/credits/transactions?page=1&pageSize=20`

新增管理员接口：

- `GET /api/admin/users/:id/credits/transactions?page=1&pageSize=20`

普通用户只能查看自己的积分流水。管理员可以查看任意用户流水。

## 前端行为

### 普通用户

在生成页展示：

- 当前积分余额。
- 本次预计消耗，例如 `预计消耗 4 积分`。
- 余额不足时禁用提交或在提交后展示后端错误。

在账号设置页增加积分概览：

- 当前余额。
- 最近积分流水列表。

前端展示只作为体验优化，真实扣费以后端事务为准。

### 管理员

在用户管理页增加：

- 积分余额列。
- “调整积分”按钮。
- 调整积分弹窗，包含增减数量和原因。

在用户详情或用户生成记录页可增加积分流水入口。第一版可以先在用户管理页弹窗完成调整，并在账号设置页提供普通用户自己的流水。

在后台配置页增加“积分规则”区域：

- 是否启用积分扣费。
- 每张图片消耗积分。
- 新用户初始积分。
- 生成失败是否退款。

保存配置沿用现有动态配置保存和审计逻辑。

## 审计与安全

积分流水是业务账本，不能被软删除或普通编辑。

审计日志记录关键操作：

- `credits.initial_granted`
- `credits.admin_adjusted`
- `credits.generation_debited`
- `credits.generation_refunded`
- `settings.updated` 中包含 `credits.*` 配置键

审计 metadata 可记录积分数量、目标用户、生成任务 id 和原因摘要。不得记录密码、token 或无关敏感配置。

所有余额修改必须通过后端服务函数完成，避免多个路由各自手写扣费逻辑。

## 错误处理

- 余额不足：`409`，code 为 `INSUFFICIENT_CREDITS`。
- 管理员调整后余额会小于 0：`409`。
- 积分配置非法：`422`。
- 用户不存在：`404`。
- 非管理员访问管理接口：`403`。

前端遇到 `INSUFFICIENT_CREDITS` 时展示明确提示，不清除登录状态。

## 测试策略

后端验证：

- 新用户注册后按 `credits.initialBalance` 发放积分。
- 初始积分为 0 时不产生无意义流水，或产生 0 流水的策略需保持一致；推荐不产生。
- 余额充足时创建生成任务会扣积分、写 generation、写流水。
- 余额不足时不会创建 generation，也不会写扣费流水。
- `credits.enabled = false` 时创建任务不扣积分。
- `credits.costPerImage = 0` 时创建任务成功且 `credit_cost = 0`。
- 生成失败且开启退款时只退款一次。
- 关闭失败退款后，失败任务不退积分。
- retry 失败任务会按当前配置重新扣积分。
- 管理员加积分成功并写流水。
- 管理员减积分不能让余额小于 0。
- 普通用户不能访问管理员积分接口。
- 普通用户只能查看自己的流水。
- 管理员可以查看指定用户流水。

前端验证：

- 生成页显示余额和预计消耗。
- 余额不足时展示明确错误。
- 管理员用户列表显示积分余额。
- 管理员调整积分弹窗可加减积分并要求原因。
- 后台配置页可以修改积分规则。
- 账号设置页展示当前余额和最近流水。

## 后续扩展

后续如果要接入充值或更复杂计价，可在现有模型上扩展：

- 新增 `orders` 和 `payments`。
- 新增 `purchase_credit` 流水类型。
- 将 `credits.costPerImage` 扩展为按质量、尺寸或模型计费的 JSON 配置。
- 增加积分过期和冻结余额。

这些能力不进入本阶段，避免把基础账本和支付系统耦合在一起。
