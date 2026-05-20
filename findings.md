# 发现与决策记录：积分额度模块

## 需求

- 用户有积分余额。
- 生成图片按积分规则扣余额。
- 生图图片所扣积分可由管理员在后台动态配置。
- 管理员可通过后台调整用户积分，并记录原因。
- 普通用户只能查看自己的余额和流水，不能自行修改积分。
- 所有积分变化都记录流水。
- 生成失败默认退还本次任务扣除的积分。

## 设计文档

- 主设计文档：`docs/superpowers/specs/2026-05-21-credits-design.md`。
- 设计提交：`79b9923 Add credits module design`。

## 代码结构发现

- 项目是 npm workspaces：`apps/api` 和 `apps/web`。
- 后端使用 Express、MySQL、Redis、multer、zod。
- 前端使用 Vite、React、React Router、lucide-react。
- 生成请求入口：`apps/api/src/routes/generations.ts`。
- 生成 worker：`apps/api/src/generationTask.ts`。
- 队列入口：`apps/api/src/queue.ts`。
- 用户创建和序列化：`apps/api/src/users.ts`。
- 动态配置服务：`apps/api/src/settingsService.ts`。
- 管理员接口：`apps/api/src/routes/admin.ts`。
- 审计日志：`apps/api/src/audit.ts`。
- 前端 API 层：`apps/web/src/api.ts`。
- 生成页：`apps/web/src/pages/GeneratePage.tsx`。
- 账号设置页：`apps/web/src/pages/SettingsPage.tsx`。
- 后台设置页：`apps/web/src/pages/AdminSettingsPage.tsx`。
- 后台用户页：`apps/web/src/pages/AdminUsersPage.tsx`。

## 当前实现约束

- `POST /api/generations` 当前先插入 generation，再调用 `enqueueGeneration`。
- `retry` 当前创建一条新的 generation 并入队。
- `processGeneration()` 在失败分支只更新 generation 状态，需要接入退款。
- 动态配置已有 `registration` 和 `mail` 分组，适合新增 `credits` 分组。
- 用户序列化目前不返回余额，需要扩展 `serializeUser`。
- 管理员用户列表 SQL 已聚合生成和图片统计，适合增加 `u.credit_balance` 直接返回。
- 项目没有测试框架，验证主要靠 typecheck/build 和手动 API。

## 技术决策

| 决策 | 原因 |
|------|------|
| 新增 `credits` 配置分组 | 沿用已有后台配置体系 |
| 新增 `creditsRouter` | 普通用户积分接口和管理员接口分离，避免 `auth` 或 `generations` 路由膨胀 |
| 新增 `credits.ts` 服务模块 | 余额修改必须集中化，降低并发和账本错误风险 |
| 生成扣费在 MySQL 事务里完成 | 保证余额、generation、流水一致 |
| 入队在事务提交后完成 | 避免任务被 worker 读取到尚未提交的数据 |
| 退款以 `credit_refunded_at` 做幂等 | 防止重复退款 |

## 风险与约束

- 如果 Redis 入队失败，生成任务可能已扣费但仍停留在 pending；第一版记录为可接受残余风险。
- 管理员调整积分必须阻止余额变成负数。
- `credits.costPerImage = 0` 是合法免费策略，不应被当作配置错误。
- `credits.enabled = false` 时不扣积分，`credit_cost` 应为 0。
- 初始积分为 0 时推荐不写 0 元流水，避免噪音。

## 资源

- 积分设计：`docs/superpowers/specs/2026-05-21-credits-design.md`
- 全量 schema：`apps/api/db/schema.sql`
- 迁移目录：`apps/api/db/migrations`
- 后端类型：`apps/api/src/db.ts`
- 动态配置：`apps/api/src/settingsService.ts`
- 生成路由：`apps/api/src/routes/generations.ts`
- 生成 worker：`apps/api/src/generationTask.ts`
- 管理员路由：`apps/api/src/routes/admin.ts`
- 前端 API：`apps/web/src/api.ts`
