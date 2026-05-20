# VPS 部署说明

## 1. 准备 MySQL

```sql
CREATE DATABASE photo_sys CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'photo_sys'@'localhost' IDENTIFIED BY 'change_this_password';
GRANT ALL PRIVILEGES ON photo_sys.* TO 'photo_sys'@'localhost';
FLUSH PRIVILEGES;
```

执行表结构：

```bash
mysql -u photo_sys -p photo_sys < apps/api/db/schema.sql
```

从旧版本升级时，执行异步任务字段迁移：

```bash
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-20-async-generation.sql
```

## 2. 配置后端环境变量

复制 `apps/api/.env.example` 为 `apps/api/.env`，填写：

```env
OPENAI_BASE_URL=https://你的中转域名
OPENAI_API_KEY=你的中转密钥
IMAGE_MODEL=gpt-image-2
DATABASE_URL=mysql://photo_sys:change_this_password@localhost:3306/photo_sys
REDIS_URL=redis://localhost:6379
STORAGE_DIR=./storage
PUBLIC_BASE_URL=https://你的站点域名
FRONTEND_ORIGIN=https://你的站点域名
REQUEST_TIMEOUT_MS=300000
```

`OPENAI_API_KEY` 只放在后端，不要放进前端环境变量。

## 3. 构建

```bash
npm install
npm run build
```

## 4. 运行后端

可以用 `pm2` 或 systemd。示例：

```bash
cd apps/api
npm run start
```

生产环境建议使用 pm2：

```bash
pm2 start apps/api/dist/server.js --name photo-sys-api
```

## 5. Nginx 示例

```nginx
server {
  listen 80;
  server_name your-domain.example;

  root /path/to/photo-sys/apps/web/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /files/ {
    proxy_pass http://127.0.0.1:3001/files/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 6. 验证

- 打开 `/settings`，点击连接测试。
- 打开 `/generate`，输入提示词并上传可选参考图。
- 生成成功后检查 `storage/generated` 是否有图片文件。
- 打开 `/history`，确认记录可以展示和删除。
