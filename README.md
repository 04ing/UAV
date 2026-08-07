# 无人机智能巡检系统

端—边—云协同的无人机智能巡检平台，支持飞控管理、AI 识别、业务工单、数据可视化与开放接口。适用于水库大坝、输电线路、水利设施等场景的自动化巡检与智能监测。

## 功能模块

| 模块 | 说明 |
|------|------|
| **综合态势大屏** | 全局运行概览，实时展示机队状态、告警统计与任务进度 |
| **飞控管理** | 无人机列表、实时遥测、一键返航、电子围栏设置与地理围栏告警 |
| **故障模拟** | 电机故障、低电量、GPS丢失、信号丢失、障碍物检测等故障注入与自动告警 |
| **紧急告警** | 低电量自动返航、电量耗尽坠毁告警、最后位置记录与救援提示 |
| **GIS 地图** | 基于 Leaflet 的二维地图，展示飞行轨迹、设备点位与巡检区域 |
| **3D 场景** | 基于 Three.js 的无人机三维可视化与场景漫游 |
| **AI 识别** | 图片上传识别，使用 YOLOv8 模型进行裂缝、剥落缺陷检测 |
| **AI 算法中心** | 模型管理、版本下发与下发进度监控 |
| **业务工单** | 巡检计划编制、工单派发、状态流转与处理闭环 |
| **运维审计** | 用户登录鉴权、操作审计日志与权限管理 |
| **开放接口** | 接口元数据清单与在线 API 文档浏览 |

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端（端侧）                              │
│  原生 ES Module SPA + Leaflet + Three.js + ECharts          │
│  大屏适配 1920×1080，深色科技风 UI                            │
└─────────────────────────────────────────────────────────────┘
                              │
                     HTTP / WebSocket
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Nginx 反向代理                           │
│  • 静态资源缓存 (7d) • gzip 压缩 • WebSocket 透传            │
│  • 负载均衡 • 安全响应头 • 请求体限流 (50MB)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                     HTTP / :4000
                              │
┌─────────────────────────────────────────────────────────────┐
│                  后端服务（云侧）                             │
│  Node.js 18 + Express 4 + WebSocket (ws)                   │
│  JWT 鉴权 / Helmet 安全 / 速率限制 / 故障模拟引擎            │
│  文件系统持久化 (JSON) / 事件驱动告警                        │
└─────────────────────────────────────────────────────────────┘
                              │
                     HTTP / :8080（可选）
                              │
┌─────────────────────────────────────────────────────────────┐
│                    YOLO 推理服务（独立）                      │
│  Python 3.11 + PyTorch + Ultralytics YOLOv8                │
│  GPU 加速（可选），提供 HTTP 推理接口                        │
└─────────────────────────────────────────────────────────────┘
```

- **前端**：HTML5 + CSS3 + 原生 ES Modules（无构建工具），第三方库通过本地 vendor 目录引入
- **后端**：Node.js ≥ 18、Express 4、WebSocket（`ws`）、JWT（`jsonwebtoken`）、Helmet、express-rate-limit
- **反向代理**：Nginx（Docker 容器化部署，支持 gzip / 缓存 / WebSocket）
- **AI 推理**：Python 3.11、PyTorch、Ultralytics YOLOv8
- **可视化**：Leaflet（GIS）、Three.js（3D）、ECharts（图表）

## 快速开始

### 方式一：Docker Compose 一键部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/04ing/UAV.git
cd UAV

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，至少修改 JWT_SECRET

# 3. 一键启动
docker compose up -d

# 4. 含 YOLO GPU 推理
docker compose --profile gpu up -d

# 5. 访问
# 浏览器打开 http://服务器IP
# 默认账号: admin / admin123
```

详细 Docker 部署文档请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)。

### 方式二：本地开发运行

#### 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Python](https://www.python.org/) ≥ 3.11（可选，仅 AI 识别需要）

#### 安装与启动

```bash
# 1. 安装 Node.js 依赖
npm install

# 2. 启动后端服务（端口 4000）
npm start

# 3. 启动 YOLO 推理服务（可选）
pip install ultralytics flask
python yolo_server.py
```

### 访问系统

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端页面 | http://localhost | 通过 Nginx 访问（Docker） |
| 后端直连 | http://localhost:4000 | 本地开发时直接访问 |
| YOLO 服务 | http://localhost:8080 | AI 推理接口 |
| 默认账号 | `admin` / `admin123` | 首次登录后请修改密码 |

## 项目结构

```
UAV/
├── frontend/                    # 前端（原生 ES Module SPA）
│   ├── index.html               # 入口页面
│   ├── css/                     # 基础样式与 CSS 变量
│   │   ├── base.css
│   │   └── tokens.css
│   ├── js/                      # 路由、API 封装与核心逻辑
│   │   ├── api.js               # API 客户端（fetch + WebSocket）
│   │   └── app.js               # 路由与布局渲染
│   ├── pages/                   # 功能页面模块
│   │   ├── dashboard.js         # 中控大屏
│   │   ├── gis.js               # GIS 地图
│   │   ├── flight.js            # 飞控管理
│   │   ├── ai-recognize.js      # AI 识别
│   │   └── ...
│   └── vendor/                  # 第三方库（本地引入）
│       ├── leaflet.js
│       ├── three.min.js
│       └── echarts.min.js
├── backend/                     # 后端（Node.js + Express）
│   ├── server.js                # 服务入口：HTTP + WebSocket
│   ├── routes/                  # API 路由
│   │   ├── drones.js            # 无人机路由 + 故障模拟
│   │   ├── ai.js                # AI 模型 + 识别接口
│   │   ├── business.js          # 巡检计划/工单/告警
│   │   ├── meta.js              # 元数据 + 健康检查
│   │   └── ops.js               # 鉴权/审计/备份
│   ├── middleware/              # 鉴权、日志
│   │   ├── auth.js              # JWT 鉴权 + 角色控制
│   │   └── logger.js            # 请求日志
│   ├── utils/                   # 工具模块
│   │   ├── djiApiAdapter.js     # DJI API 适配器 + 故障引擎
│   │   ├── eventEmitter.js      # 事件总线
│   │   └── response.js          # 统一响应格式
│   └── data/                    # 文件系统存储
│       └── dataStore.js         # 数据持久化
├── nginx/
│   └── nginx.conf               # Nginx 反向代理配置
├── tests/                       # 单元测试 + 集成测试
├── docs/                        # 文档
├── Dockerfile                   # 后端服务镜像
├── Dockerfile.yolo              # YOLO 推理服务镜像
├── docker-compose.yml           # 容器编排（三服务）
├── ecosystem.config.js          # PM2 集群配置
├── .env.example                 # 环境变量模板
├── yolo_server.py               # YOLOv8 推理服务
├── package.json
├── DEPLOYMENT.md                # 详细部署文档
└── README.md
```

## API 接口

### 设计规范

- RESTful 风格，统一返回结构：`{ code: 0, msg, data }`
- `code === 0` 表示成功，`code === 1` 表示失败
- 全局 JWT 鉴权（白名单：`/api/auth/login`、`/api/meta/health`、`/healthz`）

### 主要接口分类

| 分类 | 路径前缀 | 说明 |
|------|----------|------|
| 飞控 | `/api/drones`、`/api/geo-fences` | 机队管理、遥测、返航、电子围栏 |
| 故障模拟 | `/api/drones/:id/fault` | 故障触发与清除 |
| AI | `/api/ai` | 模型列表、图片识别、模型下发 |
| 业务 | `/api/inspection-plans`、`/api/work-orders`、`/api/alarms` | 巡检计划、工单与告警 |
| 运维 | `/api/auth`、`/api/audit-logs`、`/api/ops/backup` | 鉴权、审计、备份 |
| 元数据 | `/api/meta` | 端点清单、健康检查 |

### 健康检查端点

| 端点 | 响应 | 用途 |
|------|------|------|
| `GET /healthz` | `OK` (200) | 后端存活检查 |
| `GET /readyz` | `READY` (200) | 后端就绪检查 |
| `GET /nginx-health` | `OK` (200) | Nginx 存活检查 |

### WebSocket 实时推送

| 路径 | 说明 |
|------|------|
| `/ws/video` | 视频帧推送 |
| `/ws/alarm` | 告警事件推送（含紧急坠毁告警） |
| `/api/drones/:id/telemetry` | 遥测数据实时推送 |

## 故障模拟引擎

| 故障类型 | 说明 | 触发行为 |
|----------|------|----------|
| `motor_failure` | 电机故障 | 速度骤降、高度下降、自动返航 |
| `low_battery` | 低电量 | 电量低于 25% 自动返航 |
| `gps_lost` | GPS 丢失 | 位置随机漂移 |
| `signal_lost` | 遥控信号丢失 | 信号变为弱/无 |
| `obstacle` | 障碍物检测 | 速度降低 |

## 测试

```bash
# 运行所有测试（203 个用例）
npm test

# 运行测试并查看覆盖率
npm run test:coverage
```

## 生产部署

| 方式 | 适用场景 | 文档 |
|------|----------|------|
| **Docker Compose** | 一键容器化部署 | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| **PM2 + Nginx** | 原生 Node.js 部署 | [DEPLOYMENT.md](./DEPLOYMENT.md#pm2-nginx-原生部署) |

## AI 识别模块

### 支持的缺陷类别

| 类别 ID | 类别名称 | 说明 |
|---------|----------|------|
| 0 | 裂缝 | 混凝土表面裂缝检测 |
| 1 | 剥落 | 混凝土表面剥落检测 |

### 推理流程

1. 前端上传图片 → 后端接收 → 转发至 YOLO 推理服务
2. YOLO 服务进行预处理、推理、后处理
3. 返回检测框坐标、类别标签、置信度
4. 前端展示检测结果与统计信息

## 许可证

本项目为演示用途。
