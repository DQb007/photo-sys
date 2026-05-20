# 任务计划：积分额度模块实施

## 目标

按 `docs/superpowers/specs/2026-05-21-credits-design.md` 实现 Photo Sys 积分额度模块：用户余额、积分流水、后台动态计费配置、生成扣积分、失败退款、管理员调整积分、普通用户余额和流水展示。

## 当前阶段

Phase 7

## 阶段

### Phase 1：计划与代码结构复核

- [x] 用户确认积分模块设计文档。
- [x] 读取现有计划、发现和进度文件，确认上阶段用户权限模块已完成。
- [x] 创建积分模块实施计划。
- **状态：complete**

### Phase 2：数据库与类型基础

- [x] 新增迁移：`users.credit_balance`、`generations.credit_cost`、`generations.credit_refunded_at`、`credit_transactions`。
- [x] 更新 `apps/api/db/schema.sql`。
- [x] 更新 `apps/api/src/db.ts` 类型：用户余额、生成扣费字段、积分流水行类型。
- [x] 确认迁移对既有用户的默认余额为 0，不破坏已有数据。
- **状态：complete**

### Phase 3：后端积分服务与动态配置

- [x] 扩展 `settingsService`：新增 `credits.enabled`、`credits.costPerImage`、`credits.initialBalance`、`credits.refundOnFailure`。
- [x] 新增积分服务模块，集中处理加减余额、流水、余额不足校验和退款幂等。
- [x] 创建用户时按 `credits.initialBalance` 发放初始积分。
- [x] 确保所有余额修改都走事务和用户行锁。
- **状态：complete**

### Phase 4：生成扣费与失败退款

- [x] 改造 `POST /api/generations`：按 `count * costPerImage` 扣积分、写 `credit_cost`、写流水。
- [x] 改造 `POST /api/generations/:id/retry`：新任务按当前配置重新扣积分。
- [x] 改造 `processGeneration()`：生成失败时按配置自动退款，并保证重复执行不会重复退款。
- [x] 返回余额不足错误 `409 INSUFFICIENT_CREDITS`。
- **状态：complete**

### Phase 5：积分 API 与管理员接口

- [x] 新增普通用户积分路由：余额和自己的流水分页。
- [x] 在 `server.ts` 挂载积分路由。
- [x] 新增管理员接口：调整指定用户积分、查看指定用户流水。
- [x] 更新管理员用户列表返回 `creditBalance`。
- [x] 管理员调整积分写 `credit_transactions` 和 `audit_logs`。
- **状态：complete**

### Phase 6：前端 API 类型与用户体验

- [x] 更新 `apps/web/src/api.ts` 用户、管理员用户、配置、积分流水类型和请求函数。
- [x] 生成页展示当前余额和预计消耗，处理余额不足错误。
- [x] 账号设置页展示余额和最近积分流水。
- [x] 后台配置页增加积分规则配置。
- [x] 后台用户管理页展示余额并提供调整积分弹窗。
- **状态：complete**

### Phase 7：验证、构建与提交

- [x] 运行 `npm run typecheck -w apps/api`。
- [x] 运行 `npm run typecheck -w apps/web`。
- [x] 运行 `npm run build`。
- [x] 手动或脚本验证关键 API：注册初始积分、扣费、余额不足、失败退款、管理员调整。
- [x] 修复发现的问题。
- [x] 提交实现变更。
- **状态：complete**

## 关键问题

1. 当前项目没有测试框架，默认继续使用 typecheck/build 加关键 API 手动验证。
2. 本模块不需要新增 npm 依赖，优先沿用现有 Express、MySQL、zod 和 React 结构。
3. 余额修改必须集中在积分服务模块中，避免路由层各自手写 SQL 造成不一致。
4. 生成扣费需要 MySQL 事务；Redis 入队仍在事务提交后执行，入队失败会保留已扣费的 pending 任务，后续可增加补偿重扫。
5. 当前 Git 需要 `-c safe.directory=D:/project/ai-code-project/photo-sys` 才能执行提交相关命令。

## 已做决策

| 决策 | 原因 |
|------|------|
| 使用 `users.credit_balance` + `credit_transactions` | 快速读余额，同时保留完整账本 |
| 每张图固定扣积分，后台动态配置 | 满足当前需求，避免第一版引入复杂阶梯计价 |
| 生成失败默认退款 | 外部生成失败不应消耗用户额度 |
| 普通用户不能自助修改或充值 | 当前范围聚焦基础账本，不混入支付系统 |
| 管理员调整积分必须填写原因 | 便于追溯和审计 |
| 失败退款使用 `generations.credit_refunded_at` 幂等保护 | 防止 worker 重试或异常导致重复退款 |

## 错误记录

| 错误 | 尝试 | 处理 |
|------|------|------|
| `git add` 被 safe.directory 拦截 | 1 | 使用 `git -c safe.directory=D:/project/ai-code-project/photo-sys ...` |
| PowerShell multipart 请求脚本不兼容 | 1 | 改用 Node `fetch` + `FormData` 验证生成接口余额不足路径 |
