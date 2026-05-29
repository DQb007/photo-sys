# Debian 12 部署说明

以下示例假设项目部署在 `/opt/photo-sys`，站点域名为 `your-domain.example`，后端监听 `127.0.0.1:3001`。

## 1. 安装基础服务

```bash
sudo apt update
sudo apt install -y curl git nginx mariadb-server redis-server

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v
npm -v
```

## 2. 配置 Redis 密码

编辑 Redis 配置：

```bash
sudo nano /etc/redis/redis.conf
```

找到或新增：

```conf
requirepass your_redis_password
supervised systemd
```

重启并验证：

```bash
sudo systemctl restart redis-server
redis-cli -a 'your_redis_password' ping
```

返回 `PONG` 即可。

## 3. 准备数据库

```bash
sudo mariadb
```

执行：

```sql
CREATE DATABASE photo_sys CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'photo_sys'@'localhost' IDENTIFIED BY 'change_this_mysql_password';
GRANT ALL PRIVILEGES ON photo_sys.* TO 'photo_sys'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

新服务器首次部署时执行完整表结构：

```bash
mysql -u photo_sys -p photo_sys < apps/api/db/schema.sql
```

已有旧版本数据库升级时，不要重复导入完整 `schema.sql`，按时间顺序执行缺失的迁移文件，例如：

```bash
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-20-users-permissions-settings.sql
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-20-async-generation.sql
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-20-soft-delete-generations.sql
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-21-credits.sql
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-21-redeem-codes.sql
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-21-generation-cancel.sql
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-21-prompt-templates.sql
mysql -u photo_sys -p photo_sys < apps/api/db/migrations/2026-05-21-prompt-template-example-image.sql
```

## 4. 上传代码并安装依赖

```bash
sudo mkdir -p /opt/photo-sys
sudo chown -R $USER:$USER /opt/photo-sys
cd /opt/photo-sys

git clone <你的仓库地址> .
npm ci
```

如果不是用 Git 部署，也可以把项目文件上传到 `/opt/photo-sys` 后执行 `npm ci`。

## 5. 配置后端环境变量

```bash
cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```

生产环境建议至少配置：

```env
NODE_ENV=production
PORT=3001
PUBLIC_BASE_URL=https://your-domain.example
PUBLIC_APP_URL=https://your-domain.example
FRONTEND_ORIGIN=https://your-domain.example

OPENAI_BASE_URL=https://你的中转域名
OPENAI_API_KEY=你的中转密钥
IMAGE_MODEL=gpt-image-2

DATABASE_URL=mysql://photo_sys:change_this_mysql_password@localhost:3306/photo_sys
REDIS_URL=redis://127.0.0.1:6379
REDIS_PASSWORD=your_redis_password

STORAGE_DIR=./storage
MAX_UPLOAD_MB=30
REQUEST_TIMEOUT_MS=300000

JWT_SECRET=换成一串足够长的随机密钥
JWT_EXPIRES_IN=7d
SETTINGS_ENCRYPTION_KEY=换成另一串足够长的随机密钥

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=换成管理员初始密码
ADMIN_NAME=Administrator
```

`REDIS_PASSWORD` 是推荐写法。你也可以把密码写进 `REDIS_URL`，格式为 `redis://:your_redis_password@127.0.0.1:6379`；如果密码包含 `@`、`:`、`/` 等特殊字符，必须 URL encode。

生成随机密钥可以用：

```bash
openssl rand -base64 48
```

## 6. 构建项目

```bash
cd /opt/photo-sys
npm run build
mkdir -p storage
```

## 7. 使用 systemd 运行后端

创建服务文件：

```bash
sudo nano /etc/systemd/system/photo-sys-api.service
```

写入：

```ini
[Unit]
Description=炫步 AI API
After=network.target mariadb.service redis-server.service

[Service]
Type=simple
WorkingDirectory=/opt/photo-sys
ExecStart=/usr/bin/node /opt/photo-sys/apps/api/dist/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now photo-sys-api
sudo systemctl status photo-sys-api
```

查看日志：

```bash
journalctl -u photo-sys-api -f
```

## 8. 配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/photo-sys
```

写入：

```nginx
server {
  listen 80;
  server_name your-domain.example;

  root /opt/photo-sys/apps/web/dist;
  index index.html;

  client_max_body_size 30m;

  location / {
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /files/ {
    proxy_pass http://127.0.0.1:3001/files/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/photo-sys /etc/nginx/sites-enabled/photo-sys
sudo nginx -t
sudo systemctl reload nginx
```

如需 HTTPS，建议使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

## 9. 可选：使用 MinIO 存储图片

如果希望用户上传图片和生成图片保存到 MinIO，先安装并启动 MinIO，创建访问密钥，然后在 `apps/api/.env` 中配置：

```env
STORAGE_DRIVER=minio
STORAGE_DIR=./storage
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
MINIO_BUCKET=photo-sys
MINIO_AUTO_CREATE_BUCKET=false
MINIO_FALLBACK_TO_LOCAL=false
```

`STORAGE_DIR` 仍然保留，用于临时上传目录和旧文件迁移。MinIO 对象 key 会继续使用数据库中的相对路径，例如 `uploads/xxx.png` 和 `generated/xxx.png`。

`STORAGE_DIR=./storage` 会按启动命令所在目录解析。使用 `npm run ... -w apps/api` 时，请从项目根目录执行命令，这样会扫描 `/opt/photo-sys/storage`。

生产环境建议提前在 MinIO 控制台创建 bucket，并保持 `MINIO_AUTO_CREATE_BUCKET=false`，这样后端启动不需要 bucket 管理权限。只有本地测试且希望 API 自动建桶时，才设置为 `true`。

已有服务器图片迁移到 MinIO：

```bash
cd /opt/photo-sys

# 先预览，不上传
STORAGE_DRIVER=minio npm run migrate:storage-to-minio -w apps/api

# 确认无误后上传，已存在对象会跳过，可重复执行
STORAGE_DRIVER=minio npm run migrate:storage-to-minio -w apps/api -- --apply
```

迁移完成并验证历史图片可访问后，再保持 `STORAGE_DRIVER=minio` 重启 API：

```bash
sudo systemctl restart photo-sys-api
```

本地 `storage/` 目录不要马上删除，建议保留一段时间作为回滚备份。若 MinIO 有问题，把 `STORAGE_DRIVER` 改回 `local` 并重启 API 即可回滚到本地文件。

如果切换 MinIO 后历史图片暂时还没迁移，可以短期开启本地回退：

```env
MINIO_FALLBACK_TO_LOCAL=true
```

开启后，API 读取 MinIO 发现对象不存在时，会尝试从本地 `STORAGE_DIR` 读取同一个 storage key。这个开关只建议作为迁移期兜底，长期仍应执行迁移脚本并关闭回退。

## 10. 更新部署

```bash
cd /opt/photo-sys
git pull
npm ci
npm run build
sudo systemctl restart photo-sys-api
sudo systemctl reload nginx
```

如果更新包含新的数据库迁移，先备份数据库，再执行新增的迁移 SQL。

## 11. 验证

```bash
curl -I https://your-domain.example
curl https://your-domain.example/api/health
redis-cli -a 'your_redis_password' llen photo-sys:image-generations
```

浏览器验证：

- 打开 `https://your-domain.example/login`
- 使用管理员账号登录
- 后台配置中测试邮件发送
- 在生成页提交一次生图任务
- 在历史页确认图片能展示
