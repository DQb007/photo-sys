# 发现与决策记录

## 需求

- 用户管理和图片权限管理。
- 公开注册，但注册策略可由管理员动态关闭。
- 邮箱验证可由管理员动态开启或关闭，默认开启。
- 邮件 SMTP 配置从数据库读取，管理员可在后台动态配置。
- 管理员可管理用户、查看统计、查看审计日志、按用户查看图片生成记录。
- 普通用户只能访问自己的生成记录和文件。
- 所有文档使用中文。

## 代码结构发现

- 项目是 npm workspaces：`apps/api` 和 `apps/web`。
- 后端使用 Express、MySQL、Redis、multer、zod。
- 前端使用 Vite、React、React Router、lucide-react。
- 当前后端配置全部来自 `apps/api/src/config.ts` 的环境变量。
- 当前 `/api/settings/status` 和 `/api/settings/test` 只提供只读运行状态和连接测试。
- 当前 `generations` 表没有用户归属字段。
- 当前 `/files/:folder/:filename` 是公开文件路由，需要改成登录和归属校验。
- 当前项目没有测试框架，package 里有 typecheck 和 build。

## 设计文档

- 主设计文档：`docs/superpowers/specs/2026-05-20-user-permissions-design.md`。
- 动态配置管理已写入同一份设计文档。
- 最新相关提交：`c406de6 Document dynamic admin settings`。

## 技术决策

| 决策 | 原因 |
|------|------|
| 通用 `app_settings` 表 | 配置项会持续增加，通用表比固定单行表更容易扩展 |
| `settingsService` 统一读写配置 | 避免业务代码散落 key/value 解析和默认值逻辑 |
| 敏感配置用应用级加密 | 邮件密码需要管理员动态配置，但不能明文存储 |
| `PUBLIC_APP_URL` 先保留环境变量 | 与部署域名和反向代理强相关，避免后台误改导致验证链接不可用 |
| 文件访问通过数据库归属反查 | 不依赖文件路径猜测用户归属，权限判断更可靠 |

## 风险与约束

- 网络受限，新增依赖安装可能需要用户批准。
- SMTP 测试需要真实邮件服务配置，开发环境可用日志打印验证链接作为 fallback。
- 迁移历史数据时必须创建 `legacy-owner`，否则旧图片无法通过权限校验访问。
- 邮件密码留空保存应保留原值，不能误清空。
- 禁用或降级唯一管理员必须被阻止。

## 资源

- 后端配置：`apps/api/src/config.ts`
- 后端生成路由：`apps/api/src/routes/generations.ts`
- 后端文件路由：`apps/api/src/routes/files.ts`
- 后端设置路由：`apps/api/src/routes/settings.ts`
- 前端设置页：`apps/web/src/pages/SettingsPage.tsx`
- 权限与动态配置设计：`docs/superpowers/specs/2026-05-20-user-permissions-design.md`
