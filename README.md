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
