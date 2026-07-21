# 无人机智能巡检系统

端—边—云协同的无人机智能巡检平台，支持飞控管理、AI 识别、业务工单、数据可视化与开放接口。适用于水库大坝、输电线路、水利设施等场景的自动化巡检与智能监测。

## 功能模块

| 模块 | 说明 |
|------|------|
| **综合态势大屏** | 全局运行概览，实时展示机队状态、告警统计与任务进度 |
| **飞控管理** | 无人机列表、实时遥测、一键返航、电子围栏设置与地理围栏告警 |
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
│                        前端（端侧）                          │
│  原生 ES Module SPA + Leaflet + Three.js + ECharts          │
│  大屏适配 1920×1080，深色科技风 UI                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      后端服务（云侧）                         │
│  Node.js + Express + WebSocket（实时推送视频帧与告警）        │
│  JWT 鉴权 / CORS / 请求日志                                  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    YOLO 推理服务（独立）                      │
│  Python + PyTorch + Ultralytics YOLOv8                      │
│  端口：8080，提供 HTTP 推理接口                               │
└─────────────────────────────────────────────────────────────┘
```

- **前端**：HTML5 + CSS3 + 原生 ES Modules（无构建工具），第三方库通过 CDN 引入
- **后端**：Node.js ≥ 18、Express 4、WebSocket（`ws`）、JWT（`jsonwebtoken`）、Multer（文件上传）
- **AI 推理**：Python 3.7+、PyTorch、Ultralytics YOLOv8、OpenCV、NumPy
- **可视化**：Leaflet（GIS）、Three.js（3D）、ECharts（图表）

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Python](https://www.python.org/) ≥ 3.7
- PyTorch、Ultralytics、OpenCV、NumPy

### 安装与启动

#### 1. 安装 Node.js 依赖

```bash
# 安装依赖
npm install
```

#### 2. 安装 Python 依赖

```bash
# 安装 PyTorch（根据你的 CUDA 版本选择）
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 安装 Ultralytics
pip install ultralytics

# 安装其他依赖
pip install opencv-python numpy
```

#### 3. 启动 YOLO 推理服务

```bash
# 设置环境变量（Windows PowerShell）
$env:YOLO_CONFIG_DIR='e:\无人机智能巡检系统'

# 启动推理服务
python yolo_server.py

# 服务运行在 http://localhost:8080
```

#### 4. 启动后端服务

```bash
# 启动服务
npm start
```

### 访问系统

- 浏览器打开：http://localhost:3000
- 默认账号密码：`admin` / `admin123`
- 后端服务端口：`3000`（Express HTTP + WebSocket）
- YOLO 推理服务端口：`8080`

## 项目结构

```
drone-inspection-system/
├── frontend/                 # 前端（原生 ES Module SPA）
│   ├── index.html            # 入口页面
│   ├── css/                  # 基础样式与 CSS 变量
│   ├── js/                   # 路由、API 封装与核心逻辑
│   ├── pages/                # 各功能页面模块（按需加载）
│   └── vendor/               # CDN 回退或本地第三方库
├── backend/                  # 后端（Node.js + Express）
│   ├── server.js             # 服务入口：HTTP + WebSocket
│   ├── routes/               # API 路由（飞控/AI/业务/运维/元数据）
│   ├── middleware/           # 鉴权、日志中间件
│   ├── utils/                # 统一响应结构封装
│   └── data/                 # 数据文件
├── yolo_server.py            # YOLOv8 推理服务（独立 Python 服务）
├── yolo_inference.py         # YOLO 推理脚本（备用）
├── best.pt                   # YOLOv8 预训练模型权重
├── leftImg8bit/              # 训练数据集
├── ultralytics_settings.yaml # Ultralytics 配置文件
├── package.json
└── README.md
```

## AI 识别模块

### 支持的缺陷类别

| 类别 ID | 类别名称 | 说明 |
|---------|----------|------|
| 0 | 裂缝 | 混凝土表面裂缝检测 |
| 1 | 剥落 | 混凝土表面剥落检测 |

### 模型文件

- 模型路径：`best.pt`（YOLOv8-seg 分割模型）
- 训练数据集：`leftImg8bit/` 目录下的巡检图片

### 推理流程

1. 前端上传图片 → 后端接收 → 转发至 YOLO 推理服务
2. YOLO 服务进行预处理、推理、后处理
3. 返回检测框坐标、类别标签、置信度
4. 前端展示检测结果与统计信息

## API 接口

### 设计规范

- RESTful 风格，统一返回结构：`{ code: 0, msg, data }`
- `code === 0` 表示成功，`code === 1` 表示失败
- 全局 JWT 鉴权（白名单：`/api/auth/login`、`/api/meta/endpoints`）

### 主要接口分类

| 分类 | 路径前缀 | 说明 |
|------|----------|------|
| 飞控 | `/api/drones`、`/api/geo-fences` | 机队管理、遥测、返航、电子围栏 |
| AI | `/api/ai` | 模型列表、图片识别、模型下发与进度查询 |
| 业务 | `/api/inspection-plans`、`/api/work-orders` | 巡检计划与工单管理 |
| 运维 | `/api/auth`、`/api/audit-logs` | 登录鉴权与审计日志 |
| 接口元数据 | `/api/meta` | 端点清单与在线文档 |

### WebSocket 实时推送

- `/ws/video` —— 视频帧推送（1Hz）
- `/ws/alarm` —— 告警事件推送（1Hz）

## 开发说明

- 前端为**原生 ES Module SPA**，无构建步骤，保存即可刷新预览
- 第三方库（Leaflet、Three.js、ECharts 等）通过 CDN 引入
- UI 针对**大屏 1920×1080** 进行适配，采用**深色科技风**配色
- 后端基于 Express 提供静态资源托管、RESTful API 与 WebSocket，所有非 `/api`、`/ws` 路由均兜底返回 `index.html`
- AI 识别模块使用真实 YOLOv8 模型，需先启动 `yolo_server.py` 服务

## 系统预览

- **综合态势大屏**：深色背景，顶部标题栏，左侧统计卡片，中部 GIS 地图，右侧实时告警列表与图表
- **飞控管理**：无人机状态卡片网格，支持一键返航与实时遥测曲线
- **GIS 地图**：Leaflet 底图叠加飞行轨迹与电子围栏多边形
- **3D 场景**：Three.js 渲染的无人机模型与可交互视角漫游
- **AI 识别**：拖拽上传区域，识别结果叠加检测框与缺陷标签（使用真实 YOLOv8 模型）
- **业务工单**：表格列表与表单弹窗，支持状态流转与筛选
- **运维审计**：登录页居中卡片，审计日志按时间线倒序排列

## 许可证

本项目为演示用途。