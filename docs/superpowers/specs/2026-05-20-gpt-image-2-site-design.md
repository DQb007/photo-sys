# GPT Image 2 图片生成网站设计

日期：2026-05-20

## 目标

开发一个可部署到 VPS 的单用户图片生成网站。网站通过兼容 OpenAI Images API 的中转接口调用 `gpt-image-2`，支持文本提示词和可选参考图上传，生成结果保存在 VPS 本地磁盘，生成历史保存在 MySQL。

## 已确认决策

- 架构：前后端分离。
- 前端：Vite + React。
- 后端：Node.js + Express。
- 部署目标：用户自己的 VPS。
- 模型：`gpt-image-2`。
- 中转接口形态：兼容 OpenAI 的 `POST {OPENAI_BASE_URL}/v1/images/generations`。
- 存储：MySQL 保存元数据，VPS 本地文件系统保存上传参考图和生成图。
- 第一版页面范围：生成页、历史页、设置页。
- 第一版不做多用户登录、计费、额度、管理后台。

## 系统架构

浏览器只加载 React 前端并调用本项目后端 API。后端负责保存中转 API Key、校验输入、保存上传文件、调用图片中转接口、把元数据写入 MySQL，并通过受控文件路由提供图片访问。

推荐 VPS 路由方式：

- `/` 提供构建后的 React 前端静态资源。
- `/api/*` 反向代理到 Express 后端。
- `/files/*` 反向代理到 Express 后端，用于访问生成图和上传图。

第一版建议用同一个域名和 Nginx 部署，这样可以避免 CORS 配置复杂度。后续如果前端和后端拆成不同域名，再在后端增加明确的 CORS 白名单。

## 前端设计

前端位于 `apps/web`，使用 Vite + React。

### 路由

- `/generate`：创建图片生成任务。
- `/history`：浏览已保存的生成记录。
- `/settings`：查看后端配置状态并测试中转接口连接。
- `/`：跳转到 `/generate`。

### 生成页

生成页包含：

- 提示词输入框。
- 可选参考图上传。
- 图片尺寸、质量、生成数量等参数。
- 生成按钮和加载状态。
- 生成结果预览网格。
- 生成图下载操作。
- 表单校验错误和后端错误展示。

页面使用 multipart form data 提交到 `POST /api/generations`，参考图随表单一起上传。

### 历史页

历史页包含：

- 分页生成记录。
- 生成图缩略图预览。
- 提示词、模型、状态、参数摘要和创建时间。
- 详情视图，展示完整提示词和错误信息。
- 复用提示词操作，跳转到生成页并带入历史参数。
- 删除操作，同时删除数据库记录和关联本地文件。

### 设置页

设置页不在浏览器里编辑或保存密钥，只展示：

- 后端必要环境变量是否已配置。
- 当前模型名，显示为 `gpt-image-2`。
- 存储目录状态。
- MySQL 连接状态。
- `POST /api/settings/test` 返回的中转接口连接测试结果。

API Key 不返回给前端。

## 后端设计

后端位于 `apps/api`，使用 Express。

### API 接口

`POST /api/generations`

- 接收 multipart form data。
- 字段包括 `prompt`、可选 `size`、可选 `quality`、可选 `count`、可选 `referenceImage`。
- 校验提示词、参数、文件类型和文件大小。
- 创建一条 `pending` 状态的生成记录。
- 调用 `{OPENAI_BASE_URL}/v1/images/generations`，模型为 `gpt-image-2`。
- 将返回的 base64 图片数据保存为本地图片文件。
- 将生成记录更新为 `succeeded` 或 `failed`。
- 返回生成记录和生成图访问地址。

`GET /api/generations`

- 分页返回历史记录。
- 支持 `page`、`pageSize` 和可选状态过滤。

`GET /api/generations/:id`

- 返回单条生成记录和完整元数据。

`DELETE /api/generations/:id`

- 删除数据库记录。
- 删除关联生成图。
- 如果上传参考图没有被其他记录复用，也删除关联参考图。

`POST /api/settings/test`

- 验证 MySQL 连接和中转接口可达性。
- 只返回非敏感状态信息。

`GET /files/generated/:filename`

- 提供生成图访问。
- 必须校验文件名，防止路径穿越。

`GET /files/uploads/:filename`

- 在历史详情需要展示参考图时，提供上传图访问。

### 中转接口调用

后端调用：

```http
POST {OPENAI_BASE_URL}/v1/images/generations
Authorization: Bearer {OPENAI_API_KEY}
Content-Type: application/json 或 multipart/form-data
```

请求包含 `model: "gpt-image-2"` 和用户提示词。实现时需要把“中转请求构造器”单独封装，先支持已确认的 OpenAI 兼容格式；如果中转方对参考图字段有特殊要求，只需要调整这一层，不影响前端和业务接口。

## 数据模型

MySQL 保存生成元数据，图片二进制文件保存在 VPS 本地磁盘。

### `generations`

- `id`：主键。
- `prompt`：完整用户提示词。
- `model`：模型名，默认 `gpt-image-2`。
- `status`：`pending`、`succeeded` 或 `failed`。
- `size`：请求的图片尺寸。
- `quality`：请求的质量参数。
- `count`：请求的生成数量。
- `reference_image_path`：可为空，保存参考图本地路径或存储键。
- `error_message`：可为空，保存失败摘要。
- `created_at`：创建时间。
- `updated_at`：更新时间。

### `generation_images`

- `id`：主键。
- `generation_id`：关联 `generations.id`。
- `file_path`：生成图本地路径或存储键。
- `mime_type`：图片 MIME 类型。
- `width`：可为空，检测到时保存图片宽度。
- `height`：可为空，检测到时保存图片高度。
- `created_at`：创建时间。

## 文件存储

VPS 文件保存在 `STORAGE_DIR` 下。

推荐目录结构：

```text
storage/
  uploads/
  generated/
```

生成图文件名必须唯一，并且不能由用户直接控制，例如 `{generationId}-{index}-{random}.png`。文件访问接口必须把路径解析限制在 `STORAGE_DIR` 内，拒绝任何路径穿越请求。

## 配置

后端 `.env`：

```env
OPENAI_BASE_URL=https://relay.example.com
OPENAI_API_KEY=replace_me
IMAGE_MODEL=gpt-image-2
DATABASE_URL=mysql://user:password@localhost:3306/photo_sys
STORAGE_DIR=./storage
MAX_UPLOAD_MB=10
REQUEST_TIMEOUT_MS=120000
```

前端 `.env`：

```env
VITE_API_BASE_URL=/api
```

## 错误处理

系统需要处理：

- 后端环境变量缺失。
- 提示词为空或非法。
- 参考图格式不支持或文件过大。
- 中转接口请求超时。
- 中转接口鉴权失败。
- 中转接口拒绝模型或参数。
- MySQL 连接或查询失败。
- 文件写入或删除失败。

用户看到的错误要简短、可操作。服务端日志和 `generations.error_message` 可以保留更详细的信息，但不能记录或返回密钥。

## 测试策略

后端测试覆盖：

- 输入校验。
- 中转请求构造器。
- 使用模拟中转响应的成功生成流程。
- 中转失败时生成记录更新为 `failed`。
- 文件访问路由的路径校验。
- 删除数据库记录和本地文件的行为。

前端测试覆盖：

- 生成表单校验。
- 加载、成功、失败状态展示。
- 历史列表渲染。
- 复用提示词流程。

发布前手动验证：

- 本地或 VPS 配置 `.env`。
- 执行数据库迁移。
- 上传参考图并生成图片。
- 确认生成文件存在于磁盘。
- 确认 MySQL 记录已创建。
- 确认历史页可以预览和删除记录。

## 第一版不做

- 用户账号。
- 付费、额度或速率限制面板。
- 公开分享链接。
- 提示词模板库。
- 独立图库页。
- 后台任务队列。
- 云对象存储。
- 除可选参考图输入以外的图片编辑流程。
