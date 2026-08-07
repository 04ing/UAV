# 无人机智能巡检系统 — Docker 部署文档

## 目录

- [架构概览](#架构概览)
- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [服务说明](#服务说明)
- [环境变量配置](#环境变量配置)
- [常用操作](#常用操作)
- [健康检查](#健康检查)
- [数据持久化与备份](#数据持久化与备份)
- [更新与回滚](#更新与回滚)
- [故障排查](#故障排查)
- [生产环境最佳实践](#生产环境最佳实践)

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                       Docker Network (bridge)                 │
│                                                              │
│  ┌────────────┐   ┌────────────┐   ┌─────────────────────┐  │
│  │  uav-nginx │   │ uav-backend│   │      uav-yolo       │  │
│  │  :80       │──▶│  :4000     │──▶│      :8080          │  │
│  │  (Nginx)   │   │  (Node.js) │   │  (Python YOLOv8)    │  │
│  └────────────┘   └─────┬──────┘   └─────────────────────┘  │
│                         │                                    │
│                 ┌───────┴───────┐                           │
│                 │  Volumes      │                           │
│                 │  app-data/    │                           │
│                 │  app-logs/    │                           │
│                 └───────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| **uav-nginx** | nginx:alpine | 80 | 反向代理 / 负载均衡 / gzip / WebSocket 透传 |
| **uav-backend** | 自建 (node:18-alpine) | 4000 | Node.js 后端 + Express + WebSocket |
| **uav-yolo** | 自建 (python:3.11-slim) | 8080 | YOLOv8 图像识别（可选，GPU 加速） |

---

## 前置条件

### Docker 环境

- **Docker Engine** ≥ 20.10
- **Docker Compose** ≥ 2.0（或独立的 `docker-compose` 插件）
- **磁盘空间** ≥ 4GB（镜像 + 依赖）
- **内存** ≥ 2GB

### NVIDIA GPU（可选，YOLO GPU 加速）

```bash
# 安装 NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 推荐服务器配置

| 用途 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| 演示/测试 | 2 核 | 4GB | 20GB |
| 生产部署 | 4 核+ | 8GB+ | 50GB+ SSD |
| GPU 推理 | 4 核+ | 16GB+ | 50GB+ SSD |
|  |  |  | NVIDIA GPU |

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/04ing/UAV.git
cd UAV
```

### 2. 配置环境变量

```bash
# 复制模板
cp .env.example .env

# 编辑配置（至少修改 JWT_SECRET）
nano .env
```

**必须修改的配置**：

```bash
# 生成随机密钥
openssl rand -hex 32

# 或使用 Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

将生成的密钥填入 `.env` 的 `JWT_SECRET`。

### 3. 一键启动

```bash
# 基础启动（后端 + Nginx）
docker compose up -d

# 查看构建和启动过程
docker compose up -d --build

# 含 YOLO GPU 推理服务
docker compose --profile gpu up -d
```

### 4. 验证

```bash
# 等待服务就绪（约 10-30 秒）
sleep 15

# 检查服务状态
docker compose ps

# 健康检查
curl http://localhost/nginx-health   # Nginx 自身
curl http://localhost/healthz        # 后端应用

# 访问系统
# 浏览器打开: http://服务器IP
# 默认账号: admin / admin123
```

### 5. 停止与清理

```bash
# 停止所有服务（保留数据卷）
docker compose down

# 彻底清理（包括数据卷，⚠️ 数据将丢失）
docker compose down -v
```

---

## 服务说明

### uav-backend（Node.js 后端）

| 项目 | 说明 |
|------|------|
| 基础镜像 | `node:18-alpine` |
| 构建方式 | 多阶段构建（deps → runner） |
| 运行用户 | 非 root（`app` 用户） |
| Init 进程 | `tini`（正确处理 SIGTERM/SIGKILL） |
| 健康检查 | 每 30 秒检测 `/healthz`，3 次失败标记为 unhealthy |
| 数据存储 | JSON 文件持久化（`/app/data/store/`） |
| 重启策略 | `unless-stopped`（容器退出时自动重启） |

**挂载卷**：

| 卷 | 容器路径 | 用途 |
|----|----------|------|
| `app-data` | `/app/data/store` | 持久化 drones/alarms/orders 等 JSON 数据 |
| `app-logs` | `/app/logs` | 应用运行日志 |

### uav-nginx（反向代理）

| 项目 | 说明 |
|------|------|
| 基础镜像 | `nginx:alpine` |
| 端口映射 | `80` → 容器 `80` |
| 依赖 | `uav-backend` 健康检查通过后才启动 |

**Nginx 路由规则**：

| 路径 | 转发目标 | 说明 |
|------|----------|------|
| `/` | backend | 前端 SPA 路由 |
| `/api/*` | backend | REST API |
| `/ws/*` | backend | WebSocket（视频/告警/遥测） |
| `/healthz` | backend | 后端健康检查 |
| `/readyz` | backend | 后端就绪检查 |
| `/nginx-health` | 自身 | Nginx 存活检查（不转发） |
| `*.js/css/png/...` | backend | 静态资源（缓存 7 天） |

**功能特性**：
- gzip 压缩
- WebSocket 协议升级支持
- 静态资源 7 天缓存
- 请求体大小限制 50MB（支持图片上传）
- 安全响应头（X-Frame-Options, X-Content-Type-Options）

### uav-yolo（YOLO 推理，可选）

| 项目 | 说明 |
|------|------|
| 基础镜像 | `python:3.11-slim` |
| 启动方式 | `--profile gpu` 显式启用 |
| GPU 支持 | NVIDIA GPU 自动识别 |
| 端口映射 | `8080` → 容器 `8080` |

**注意**：不启动 YOLO 服务时，AI 识别功能不可用，其他功能正常。

---

## 环境变量配置

### 完整变量列表

在项目根目录的 `.env` 文件中配置：

| 变量 | 默认值 | 必需 | 说明 |
|------|--------|------|------|
| `NODE_ENV` | production | 否 | 运行环境 |
| `PORT` | 4000 | 否 | 后端容器内端口 |
| `LOG_LEVEL` | info | 否 | 日志级别 |
| `JWT_SECRET` | *(需修改)* | **是** | JWT 签名密钥，必须随机生成 |
| `JWT_EXPIRES_IN` | 8h | 否 | Token 过期时间 |
| `DJI_APP_KEY` | *(空)* | 否 | DJI 上云 API Key |
| `DJI_APP_SECRET` | *(空)* | 否 | DJI 上云 API Secret |
| `DJI_API_URL` | https://api.dji.com | 否 | DJI API 地址 |
| `YOLO_SERVER_URL` | http://yolo:8080 | 否 | YOLO 服务地址（容器内自动配置） |
| `HTTP_PORT` | 80 | 否 | 主机 HTTP 端口映射 |
| `YOLO_PORT` | 8080 | 否 | 主机 YOLO 端口映射 |

### 不同场景的配置示例

#### 场景 A：最小化配置（演示用）

```env
JWT_SECRET=my-demo-secret-key-change-me
HTTP_PORT=80
```

#### 场景 B：生产环境配置

```env
NODE_ENV=production
JWT_SECRET=7f3c2a9e1b4d6f8a0c2d4e6f8a0b2d4e6f8a0b2d4e6f8a0b2d4e6f8a0b2d4
JWT_EXPIRES_IN=8h
LOG_LEVEL=warn
HTTP_PORT=80
```

#### 场景 C：DJI 真实接入

```env
JWT_SECRET=<your-random-secret>
DJI_APP_KEY=your-dji-app-key
DJI_APP_SECRET=your-dji-app-secret
DJI_API_URL=https://api.dji.com
```

---

## 常用操作

### 查看服务状态

```bash
# 所有服务状态
docker compose ps

# 查看后端进程详情
docker compose logs --tail=50 backend

# 查看 Nginx 访问日志
docker compose logs -f nginx

# 查看实时日志
docker compose logs -f
```

### 服务管理

```bash
# 启动/停止/重启单个服务
docker compose start backend
docker compose stop backend
docker compose restart backend

# 重启所有服务
docker compose restart

# 重新构建并重启
docker compose up -d --build
```

### 进入容器调试

```bash
# 进入后端容器
docker compose exec backend sh

# 进入 Nginx 容器
docker compose exec nginx sh

# 在容器内执行命令
docker compose exec backend node -e "console.log('hello')"
```

### 容器资源监控

```bash
# 实时 CPU/内存占用
docker stats

# 指定容器
docker stats uav-backend uav-nginx uav-yolo
```

### 日志管理

```bash
# 查看最近 100 行
docker compose logs --tail=100 backend

# 实时跟踪
docker compose logs -f nginx

# 查看 Nginx 错误日志
docker compose exec nginx tail -f /var/log/nginx/error.log
```

---

## 健康检查

### 端点列表

| 端点 | 方法 | 响应 | 说明 |
|------|------|------|------|
| `/healthz` | GET | `OK` (200) | 后端进程存活检查 |
| `/readyz` | GET | `READY` (200) | 后端就绪检查 |
| `/nginx-health` | GET | `OK` (200) | Nginx 自身存活检查 |

### 使用示例

```bash
# 基础健康检查
curl -s http://localhost/healthz
# 输出: OK

# 带状态码检查
curl -s -o /dev/null -w "%{http_code}" http://localhost/healthz
# 输出: 200

# 检查后端详细响应
curl -s http://localhost/api/meta/health

# 脚本中使用
if curl -s -o /dev/null -w "%{http_code}" http://localhost/healthz | grep -q 200; then
    echo "服务正常"
else
    echo "服务异常"
fi
```

### Docker 内置健康检查

```bash
# 查看健康检查状态
docker inspect --format='{{json .State.Health}}' uav-backend | python3 -m json.tool

# 查看容器健康历史
docker inspect uav-backend | grep -A 20 "Health"
```

---

## 数据持久化与备份

### 数据存储说明

项目使用 **Docker Named Volumes** 持久化数据：

| 卷 | 数据内容 | 路径 |
|----|----------|------|
| `app-data` | 无人机、告警、工单、巡检计划、审计日志、用户 | `/app/data/store/*.json` |
| `app-logs` | 应用运行日志 | `/app/logs/*.log` |

### 查看卷

```bash
docker volume ls | grep uav
docker volume inspect uav_app-data
```

### 数据备份

```bash
# 备份数据卷到本地
docker run --rm \
  -v uav_app-data:/data \
  -v $(pwd):/backup \
  alpine tar -czf /backup/uav-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data

# 或使用后端备份 API
curl -X POST http://localhost/api/ops/backup \
  -H "Authorization: Bearer <token>"

# 下载备份
# 登录后访问: /api/ops/backup
```

### 数据恢复

```bash
# 从备份文件恢复
docker run --rm \
  -v uav_app-data:/data \
  -v $(pwd):/backup \
  alpine tar -xzf /backup/uav-backup-YYYYMMDD-HHMMSS.tar.gz -C /
```

---

## 更新与回滚

### 版本更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建并启动（零停机）
docker compose up -d --build

# 3. 验证
docker compose ps
curl -s http://localhost/healthz
```

### 回滚

```bash
# 方式 A：回滚 Git 提交
git checkout <previous-commit>
docker compose up -d --build

# 方式 B：保留旧镜像手动回滚
# 修改 docker-compose.yml 中的镜像 tag
docker compose up -d
```

### 镜像管理

```bash
# 查看本地镜像
docker images | grep uav

# 清理旧镜像
docker image prune -f

# 查看构建缓存
docker system df
```

---

## 故障排查

### 服务无法启动

```bash
# 查看启动日志
docker compose logs --tail=100 backend

# 检查端口占用
netstat -tlnp | grep 80
lsof -i :80

# 强制重建
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 后端 502 Bad Gateway

```bash
# Nginx 无法连接后端
# 1. 检查后端是否运行
docker compose ps backend

# 2. 检查后端健康
docker compose exec backend curl -s http://localhost:4000/healthz

# 3. 查看 Nginx 错误日志
docker compose exec nginx tail -50 /var/log/nginx/error.log

# 4. 重启后端
docker compose restart backend
```

### JWT 验证失败

```bash
# 检查 JWT_SECRET 是否一致
# .env 中的值必须与容器内一致
docker compose exec backend env | grep JWT
```

### 文件上传失败

```bash
# 检查 Nginx 请求体限制
# 最大 50MB，如需更大请修改 nginx/nginx.conf
# client_max_body_size 100m;

# 检查磁盘空间
docker system df
```

### 性能问题

```bash
# 查看资源占用
docker stats --no-stream

# 检查日志级别（生产环境建议 warn）
# 修改 .env: LOG_LEVEL=warn

# 清理历史日志
docker compose exec backend truncate -s 0 /app/logs/backend-error.log
```

### 权限问题

```bash
# 容器以非 root 用户运行
# 如需调试可临时改为 root
# 在 Dockerfile 中移除 USER app 行

# 挂载卷权限
docker run --rm -v uav_app-data:/data alpine ls -la /data/
```

---

## 生产环境最佳实践

### 安全加固

```env
# 1. 使用强随机 JWT 密钥
JWT_SECRET=openssl rand -hex 32

# 2. 限制服务器端口（只开放 80/443）
# 使用云服务商安全组

# 3. 修改默认密码
# 首次登录后立即修改 admin 密码

# 4. 启用 HTTPS（推荐）
# 在 nginx/ 目录下添加 SSL 配置
```

### HTTPS 配置（可选）

```bash
# 生成自签名证书或使用 Let's Encrypt
mkdir -p nginx/ssl
openssl req -x509 -newkey rsa:4096 -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem -days 365 -nodes

# 或使用 certbot（推荐）
docker run --rm -p 443:443 -p 80:80 \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone -d your-domain.com
```

### 日志轮转

```bash
# Docker 自动日志轮转（daemon.json）
# 编辑 /etc/docker/daemon.json:
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# 重启 Docker
sudo systemctl restart docker
```

### 备份策略

```bash
# 每日自动备份（cron）
crontab -e
# 每天凌晨 2 点执行：
0 2 * * * cd /path/to/project && docker run --rm -v uav_app-data:/data -v /backup:/backup alpine tar -czf /backup/uav-$(date +\%Y\%m\%d).tar.gz /data
```

### 监控告警

```bash
# 使用健康检查端点配合监控系统
# Prometheus + Alertmanager 示例：
#   scrape_configs:
#     - job_name: 'uav-backend'
#       metrics_path: '/healthz'
#       static_configs:
#         - targets: ['localhost:80']
```

---

## 文件清单

| 文件 | 用途 |
|------|------|
| `Dockerfile` | 后端服务镜像构建 |
| `Dockerfile.yolo` | YOLO 推理服务镜像构建 |
| `docker-compose.yml` | 服务编排（backend + nginx + yolo） |
| `nginx/nginx.conf` | Nginx 反向代理完整配置 |
| `.dockerignore` | 构建时排除的文件 |
| `.env.example` | 环境变量模板 |

---

## 常见问题

**Q: 容器启动后访问白屏？**

A: 等待后端完全启动（健康检查通过），刷新页面。Nginx 配置了 `depends_on` 等待后端就绪。

**Q: AI 识别功能不可用？**

A: 需要启动 YOLO 服务：`docker compose --profile gpu up -d`。无 GPU 环境可考虑部署 CPU 版本。

**Q: 如何修改默认端口？**

A: 编辑 `.env` 中的 `HTTP_PORT`，如 `HTTP_PORT=8080`，然后重启。

**Q: 数据卷存在哪里？**

A: Docker Named Volume `uav_app-data` 和 `uav_app-logs`。使用 `docker volume inspect` 查看路径。

**Q: 容器内时区不对？**

A: 在 Dockerfile 中添加：`RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo Asia/Shanghai > /etc/timezone`
