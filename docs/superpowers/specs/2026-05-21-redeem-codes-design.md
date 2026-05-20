# Photo Sys 兑换码充值积分模块设计

日期：2026-05-21

## 目标

在现有积分额度模块基础上加入兑换码充值能力。管理员在后台动态维护兑换套餐，并基于套餐批量生成一次性兑换码。用户在账号设置页输入兑换码后获得积分。兑换成功写入积分流水，兑换码标记为已使用，管理员可查看套餐、批次和兑换状态。

本阶段不接入支付网关、不做订单系统、不做第三方平台 API 对接、不做多人共享通用码、不做可重复兑换码。

## 已确认决策

- 兑换码由 Photo Sys 后台生成。
- 管理员先动态配置兑换套餐。
- 管理员选择套餐批量生成兑换码。
- 兑换码保存生成时的套餐积分快照。
- 后续套餐改名或改积分，不影响已生成兑换码。
- 批次生成时可选有效期，不填表示长期有效。
- 每个兑换码只能兑换一次。
- 兑换成功后绑定兑换用户和兑换时间。
- 普通用户只能兑换和查看自己的积分流水，不能查看兑换码列表。

## 推荐方案

采用“兑换套餐 + 兑换码批次 + 兑换码”的模型。

- `redeem_packages`：后台动态维护套餐。
- `redeem_code_batches`：一次生成操作形成一个批次，记录套餐快照、数量、有效期和创建人。
- `redeem_codes`：实际兑换码，保存哈希、展示用后缀、积分面额、状态、使用人和使用时间。

兑换成功时复用现有积分服务，新增 `credit_transactions.type = redeem_code_credit`。这样余额变更仍走同一套账本和事务逻辑。

## 数据模型

### `redeem_packages`

- `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`
- `name VARCHAR(120) NOT NULL`
- `credits INT UNSIGNED NOT NULL`
- `status ENUM('active', 'disabled') NOT NULL DEFAULT 'active'`
- `description VARCHAR(500) NULL`
- `created_by BIGINT UNSIGNED NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

索引：

- `idx_redeem_packages_status (status)`
- `idx_redeem_packages_created_at (created_at)`

规则：

- `credits` 必须大于 0。
- 禁用套餐不影响已生成兑换码，只禁止基于该套餐继续生成新批次。

### `redeem_code_batches`

- `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`
- `package_id BIGINT UNSIGNED NULL`
- `package_name_snapshot VARCHAR(120) NOT NULL`
- `credits_snapshot INT UNSIGNED NOT NULL`
- `quantity INT UNSIGNED NOT NULL`
- `expires_at TIMESTAMP NULL`
- `note VARCHAR(500) NULL`
- `created_by BIGINT UNSIGNED NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`

索引：

- `idx_redeem_code_batches_package_id (package_id)`
- `idx_redeem_code_batches_created_at (created_at)`
- `idx_redeem_code_batches_expires_at (expires_at)`

规则：

- 批次保存套餐名称和积分快照。
- 套餐被删除或禁用后，批次仍保留。
- `expires_at` 为空表示长期有效。

### `redeem_codes`

- `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`
- `batch_id BIGINT UNSIGNED NOT NULL`
- `code_hash CHAR(64) NOT NULL`
- `code_suffix VARCHAR(12) NOT NULL`
- `credits INT UNSIGNED NOT NULL`
- `status ENUM('active', 'disabled', 'redeemed') NOT NULL DEFAULT 'active'`
- `redeemed_by BIGINT UNSIGNED NULL`
- `redeemed_at TIMESTAMP NULL`
- `expires_at TIMESTAMP NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`

索引：

- `uq_redeem_codes_hash (code_hash)`
- `idx_redeem_codes_batch_id (batch_id)`
- `idx_redeem_codes_status (status)`
- `idx_redeem_codes_redeemed_by (redeemed_by)`
- `idx_redeem_codes_expires_at (expires_at)`

规则：

- 数据库只保存兑换码哈希，不保存完整明文码。
- 后台生成后可在响应中返回本次新生成的明文码，用于复制或导出；页面刷新后不再显示完整明文。
- `code_suffix` 用于后台排查，例如展示后 6 到 10 位。
- 兑换码状态为 `redeemed` 后不能再次兑换。
- 管理员可禁用未兑换的码。

### `credit_transactions` 调整

`type` 增加：

- `redeem_code_credit`

兑换成功流水：

- `amount` 为正数。
- `reason` 可写入 `兑换码充值`。
- `metadata_json` 记录 `redeemCodeId`、`batchId`、`packageNameSnapshot`。

## 兑换码格式

推荐格式：

```text
PS-XXXX-XXXX-XXXX
```

生成规则：

- 使用密码学安全随机数生成。
- 入库前标准化为大写并去除空格。
- 保存 SHA-256 哈希。
- 用户输入时允许小写和空格，后端统一标准化。

不使用可预测序列号，不把批次 id 或套餐 id 编进明文码。

## 后端流程

### 管理员维护套餐

接口：

- `GET /api/admin/redeem-packages`
- `POST /api/admin/redeem-packages`
- `PATCH /api/admin/redeem-packages/:id`

创建套餐请求：

```json
{
  "name": "标准包",
  "credits": 50,
  "description": "第三方平台标准售卖包"
}
```

更新套餐可修改名称、积分、描述和状态。修改套餐只影响之后生成的批次。

### 管理员生成兑换码批次

接口：

- `POST /api/admin/redeem-code-batches`

请求：

```json
{
  "packageId": 1,
  "quantity": 100,
  "expiresAt": "2026-12-31T15:59:59.000Z",
  "note": "第三方平台 6 月活动"
}
```

流程：

1. 校验管理员权限。
2. 读取套餐，要求套餐为 `active`。
3. 创建批次，保存套餐名称和积分快照。
4. 生成指定数量的兑换码。
5. 对每个兑换码保存哈希、后缀、积分快照、过期时间。
6. 返回批次信息和本次明文兑换码列表。
7. 写入审计日志 `redeem_codes.batch_created`。

数量限制：

- 第一版建议单批最多 1000 个码。
- 如果需要更大批次，后续再做后台任务和文件导出。

### 管理员查看批次和兑换码

接口：

- `GET /api/admin/redeem-code-batches`
- `GET /api/admin/redeem-code-batches/:id`
- `GET /api/admin/redeem-code-batches/:id/codes`

批次列表展示：

- 批次 id
- 套餐快照名称
- 积分快照
- 总数量
- 已兑换数量
- 未兑换数量
- 禁用数量
- 过期时间
- 创建时间
- 备注

兑换码列表展示：

- id
- 后缀
- 积分
- 状态
- 过期时间
- 兑换用户邮箱
- 兑换时间

默认不返回完整明文码。

### 用户兑换

接口：

- `POST /api/redeem-codes/redeem`

请求：

```json
{
  "code": "PS-ABCD-EFGH-IJKL"
}
```

流程必须在 MySQL 事务中完成：

1. 标准化兑换码并计算哈希。
2. 使用 `SELECT ... FOR UPDATE` 锁定兑换码行。
3. 校验兑换码存在。
4. 校验状态为 `active`。
5. 校验未过期。
6. 锁定用户行。
7. 增加 `users.credit_balance`。
8. 插入 `credit_transactions`，类型为 `redeem_code_credit`。
9. 更新兑换码为 `redeemed`，写入 `redeemed_by` 和 `redeemed_at`。
10. 提交事务。
11. 写入审计日志 `redeem_codes.redeemed`。

并发保护：

- 同一个兑换码并发提交时，只有第一个事务能成功。
- 后续请求会看到状态已变为 `redeemed`，返回明确错误。

### 管理员禁用兑换码

接口：

- `POST /api/admin/redeem-codes/:id/disable`

规则：

- 只能禁用 `active` 且未兑换的码。
- 已兑换码不能禁用或撤销。
- 禁用后不能兑换。
- 写审计日志 `redeem_codes.disabled`。

第一版不做“撤销兑换并扣回积分”，避免和已消费积分产生复杂账务冲突。

## 前端行为

### 普通用户

在账号设置页增加“兑换码充值”区域：

- 输入兑换码。
- 点击兑换。
- 成功后刷新积分余额和流水。
- 失败时展示明确错误。

用户提示：

- 兑换成功：显示增加积分数和当前余额。
- 兑换码不存在、已使用、已过期、已禁用：分别展示清晰错误。

### 管理员

新增后台页面或在用户/配置管理附近增加入口：

- `/admin/redeem-packages`
- `/admin/redeem-code-batches`

第一版可以合并成一个“兑换码管理”页面，包含三个区域：

- 套餐管理：创建、编辑、启用、停用。
- 批次生成：选择套餐、数量、有效期、备注。
- 批次列表：查看批次统计和批次下兑换码。

生成批次成功后，页面展示本次明文兑换码列表，并提供复制全部。刷新后不再展示完整明文码。

## 错误处理

- 兑换码不存在：`404` 或统一 `400 INVALID_REDEEM_CODE`。
- 兑换码已使用：`409 REDEEM_CODE_ALREADY_USED`。
- 兑换码已过期：`409 REDEEM_CODE_EXPIRED`。
- 兑换码已禁用：`409 REDEEM_CODE_DISABLED`。
- 套餐不存在：`404`。
- 套餐已禁用时生成批次：`409`。
- 批次数量超限：`422`。

为减少枚举风险，普通用户兑换接口可以对“不存在”和“格式错误”返回同一类错误。管理员接口可以返回更详细状态。

## 安全要求

- 完整兑换码只在生成响应中出现一次。
- 数据库只保存哈希和后缀。
- 兑换码生成使用安全随机数。
- 兑换流程必须事务化并锁定兑换码行和用户行。
- 审计日志不得记录完整明文码。
- 管理员导出或复制兑换码时，仅限本次生成响应。
- 普通用户不能查询兑换码状态或批次信息。

## 测试策略

后端验证：

- 管理员可以创建、编辑、禁用套餐。
- 禁用套餐不能生成新批次。
- 管理员可以基于套餐生成批次。
- 生成批次返回明文码，数据库只保存哈希。
- 兑换码按生成时套餐积分充值。
- 套餐改价后，旧码仍按快照积分兑换。
- 长期有效码可以兑换。
- 过期码不能兑换。
- 禁用码不能兑换。
- 已兑换码不能重复兑换。
- 并发兑换同一个码只有一次成功。
- 兑换成功会增加余额、写积分流水、更新兑换码状态。
- 兑换成功的积分流水 metadata 包含兑换码和批次引用。
- 普通用户不能访问管理员兑换码接口。
- 管理员可以查看批次统计和兑换状态。

前端验证：

- 用户账号设置页可以输入兑换码并成功充值。
- 兑换成功后余额和流水刷新。
- 兑换失败时展示清晰错误。
- 管理员可以创建套餐。
- 管理员可以生成批次并复制本次明文码。
- 管理员可以查看批次列表和状态统计。

## 暂不实现

- 支付订单和自动发货。
- 第三方平台 API 对接。
- CSV 文件上传导入兑换码。
- 已兑换码撤销。
- 可重复兑换通用码。
- 兑换码转赠或绑定购买人。
- 大批量后台异步生成和文件下载。
