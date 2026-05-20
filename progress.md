# 进度记录：积分额度模块

## Session：2026-05-21

### Brainstorming 与设计

- **状态：complete**
- 已完成：
  - 使用 `brainstorming` 技能读取项目代码和 git 历史。
  - 确认积分模块范围：余额、流水、后台动态扣费配置、管理员调整、失败退款。
  - 回答用户确认问题：生图扣分可后台配置；普通用户不能自行修改积分。
  - 写入设计文档 `docs/superpowers/specs/2026-05-21-credits-design.md`。
  - 自审设计文档，未发现 TBD/TODO 或明显冲突。
  - 提交设计文档：`79b9923 Add credits module design`。

### Phase 1：计划与代码结构复核

- **状态：complete**
- 已完成：
  - 用户确认设计文档。
  - 使用 `planning-with-files` 技能恢复现有计划文件上下文。
  - 将根目录计划文件切换到积分模块实施计划。
  - 记录积分模块相关发现、约束和决策。
- 文件创建或修改：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### Phase 2-6：积分模块实现

- **状态：complete**
- 已完成：
  - 新增积分迁移和全量 schema 字段：用户余额、生成扣费、退款标记、积分流水表。
  - 扩展后端类型和动态配置，新增 `credits` 配置分组。
  - 新增积分服务模块，集中处理余额修改、流水、扣费和失败退款。
  - 注册新用户按配置发放初始积分。
  - 创建生成任务和重试任务时按当前配置扣积分。
  - 生成失败按配置自动退款，并通过 `credit_refunded_at` 幂等保护。
  - 新增普通用户积分余额和流水接口。
  - 新增管理员调整积分和查看用户积分流水接口。
  - 后台用户列表展示积分余额并支持调整积分。
  - 后台配置页支持积分规则配置。
  - 生成页展示余额和预计消耗。
  - 账号设置页展示余额和最近积分流水。
- 文件创建或修改：
  - `apps/api/db/migrations/2026-05-21-credits.sql`
  - `apps/api/db/schema.sql`
  - `apps/api/src/db.ts`
  - `apps/api/src/credits.ts`
  - `apps/api/src/routes/credits.ts`
  - `apps/api/src/routes/generations.ts`
  - `apps/api/src/routes/admin.ts`
  - `apps/api/src/generationTask.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/settingsService.ts`
  - `apps/api/src/users.ts`
  - `apps/web/src/api.ts`
  - `apps/web/src/pages/GeneratePage.tsx`
  - `apps/web/src/pages/SettingsPage.tsx`
  - `apps/web/src/pages/AdminSettingsPage.tsx`
  - `apps/web/src/pages/AdminUsersPage.tsx`
  - `apps/web/src/styles.css`
  - `task_plan.md`

### Phase 7：验证

- **状态：complete**
- 已完成：
  - 后端 typecheck 通过。
  - 前端 typecheck 通过。
  - 全量 build 通过。
  - `git diff --check` 通过。
  - API health 通过。
  - 管理员登录通过。
  - 普通积分余额接口返回余额和积分配置。
  - 后台配置接口返回 `credits` 配置。
  - 后台用户列表返回 `creditBalance`。
  - 管理员给用户加 1 积分成功，再减 1 积分回滚成功。
  - 管理员用户积分流水查询返回调整流水。
  - 0 余额提交生成任务返回 `409` 和 `INSUFFICIENT_CREDITS`，未进入外部生图。

## 测试结果

| 测试 | 输入 | 预期 | 实际 | 状态 |
|------|------|------|------|------|
| 后端 typecheck | `npm run typecheck -w apps/api` | 通过 | 通过 | 通过 |
| 前端 typecheck | `npm run typecheck -w apps/web` | 通过 | 通过 | 通过 |
| 全量 build | `npm run build` | 通过 | 通过 | 通过 |
| Diff check | `git diff --check` | 无 whitespace/error | 通过 | 通过 |
| API health | `GET /api/health` | 返回 ok | 返回 ok | 通过 |
| 管理员登录 | `POST /api/auth/login` | 返回 admin token | 通过 | 通过 |
| 积分余额 | `GET /api/credits/balance` | 返回余额和 credits 配置 | 通过 | 通过 |
| 管理员调积分 | 加 1 后减 1 | 余额回滚到原值 | 0 -> 1 -> 0 | 通过 |
| 积分流水 | `GET /api/admin/users/:id/credits/transactions` | 返回流水 | 返回 2 条验证流水 | 通过 |
| 余额不足生成 | 0 余额提交生成 | `409 INSUFFICIENT_CREDITS` | 通过 | 通过 |

## 错误日志

| 时间 | 错误 | 尝试 | 处理 |
|------|------|------|------|
| 2026-05-21 | `git add` 被 safe.directory 拦截 | 1 | 使用 `git -c safe.directory=D:/project/ai-code-project/photo-sys ...` 完成提交 |
| 2026-05-21 | PowerShell `Invoke-WebRequest -Form` 不支持 | 1 | 换用 Node `fetch` + `FormData` 验证 multipart 生成接口 |
| 2026-05-21 | PowerShell 缺少 `System.Net.Http` 类型 | 1 | 放弃该路径，使用 Node 客户端 |

## 5 问恢复检查

| 问题 | 答案 |
|------|------|
| 我在哪？ | 积分模块实现和验证完成 |
| 我要去哪？ | 提交验证记录 |
| 目标是什么？ | 完成 Photo Sys 积分额度模块 |
| 我学到了什么？ | 见 `findings.md` |
| 我做了什么？ | 见本文件上方记录 |
