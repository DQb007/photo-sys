# Photo Sys

前后端分离的 `gpt-image-2` 图片生成网站。

## 结构

- `apps/web`：Vite + React 前端。
- `apps/api`：Express 后端，负责调用中转接口、写 MySQL、保存图片文件。
- `docs/superpowers/specs`：设计文档。

## 本地启动

1. 安装依赖：

```bash
npm install
```

2. 创建 MySQL 数据库并执行：

```bash
mysql -u root -p photo_sys < apps/api/db/schema.sql
```

3. 复制并填写后端环境变量：

```bash
cp apps/api/.env.example apps/api/.env
```

4. 启动后端和前端：

```bash
npm run dev:api
npm run dev:web
```

默认前端地址为 `http://localhost:5173`，后端地址为 `http://localhost:3001`。

## 文档

- 设计文档：`docs/superpowers/specs/2026-05-20-gpt-image-2-site-design.md`
- VPS 部署说明：`docs/deployment.md`

## 清理上传参考图

如果生产环境使用 MinIO，先按部署文档完成本地文件迁移；清理脚本只用于 `STORAGE_DRIVER=local` 的本地目录扫描。

`storage/uploads` 保存用户上传的参考图。不要直接删除整个目录，否则可能导致正在生成的任务失败、历史记录参考图无法预览，或重试生成时找不到原参考图。

安全清理命令只会扫描 `uploads` 目录，并保留仍被数据库引用的文件：

- 未删除生成记录中的 `generations.reference_image_path`
- 图片去重表中的 `reference_uploads.storage_key`

先运行 dry-run 查看候选文件，不会实际删除：

```bash
npm run cleanup:uploads -w apps/api
```

确认输出无误后，再执行真正删除：

```bash
npm run cleanup:uploads -w apps/api -- --apply
```

需要查看完整候选列表时加 `--verbose`：

```bash
npm run cleanup:uploads -w apps/api -- --verbose
```

执行清理前，建议先完成最新数据库迁移，确保 `reference_uploads` 表存在：

```bash
mysql -u root -p photo_sys < apps/api/db/migrations/2026-05-24-reference-upload-dedup.sql
```
