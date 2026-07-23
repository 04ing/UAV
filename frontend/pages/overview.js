/* =====================================================================
 * overview.js — 架构总览页（Task 9）
 * 端—边—云三层协同架构 · 节点状态 · 数据流向 · 节点详情
 * ===================================================================== */

import { drones as dronesApi } from '/js/api.js';

/* ====================================================================
 * 节点 Mock 数据 — 三层架构拓扑
 * ==================================================================== */
const NODES = {
  device: [
    {
      id: 'DEV-DRONE-001', kind: 'drone', icon: '🚁', name: '巡检无人机 01',
      model: 'DJI M350', status: 'online',
      ip: '192.168.10.11', version: 'fw-v3.2.1', heartbeat: '2026-07-20 10:31:42',
      role: '大坝主体日常巡检 · 飞行任务执行与影像采集',
      metrics: { 电量: '85%', 信号: '强', 高度: '120m' }
    },
    {
      id: 'DEV-DRONE-002', kind: 'drone', icon: '🚁', name: '巡检无人机 02',
      model: 'DJI M30T', status: 'online',
      ip: '192.168.10.12', version: 'fw-v3.2.1', heartbeat: '2026-07-20 10:31:40',
      role: '库区水面周巡检 · 红外 + 可见光双光采集',
      metrics: { 电量: '72%', 信号: '强', 高度: '80m' }
    },
    {
      id: 'DEV-DRONE-003', kind: 'drone', icon: '🚁', name: '巡检无人机 03',
      model: 'DJI Matrice 300', status: 'warn',
      ip: '192.168.10.13', version: 'fw-v3.1.5', heartbeat: '2026-07-20 10:31:35',
      role: '边坡月度巡检 · 电量偏低返航中',
      metrics: { 电量: '45%', 信号: '中', 高度: '60m' }
    },
    {
      id: 'DEV-DRONE-004', kind: 'drone', icon: '🚁', name: '巡检无人机 04',
      model: 'DJI M350', status: 'online',
      ip: '192.168.10.14', version: 'fw-v3.2.1', heartbeat: '2026-07-20 10:31:42',
      role: '管理区夜间巡检 · 待命状态',
      metrics: { 电量: '90%', 信号: '强', 高度: '0m' }
    },
    {
      id: 'DEV-GCS-001', kind: 'gcs', icon: '🖥️', name: '地面站 A',
      model: 'DJI Smart RC Pro', status: 'online',
      ip: '192.168.10.20', version: 'gcs-v2.0.0', heartbeat: '2026-07-20 10:31:43',
      role: '飞行任务编排 · 实时遥控 · 航线下发',
      metrics: { 通道: '4', 链路: '稳定', 延迟: '12ms' }
    },
    {
      id: 'DEV-MCV-001', kind: 'mcv', icon: '🚐', name: '移动指挥车',
      model: 'MCV-X1', status: 'online',
      ip: '192.168.10.30', version: 'mcv-v1.4.0', heartbeat: '2026-07-20 10:31:41',
      role: '现场指挥 · 应急通信中继 · 移动数据中心',
      metrics: { 通信: '4G/5G', 卫星: '在线', 定位: '北斗' }
    },
    {
      id: 'DEV-SEN-001', kind: 'sensor', icon: '📡', name: '环境传感器 01',
      model: 'ESP32-S3', status: 'online',
      ip: '192.168.10.41', version: 'sensor-v1.0.3', heartbeat: '2026-07-20 10:31:38',
      role: '温湿度 · 风速风向 · 大气压采集节点',
      metrics: { 温度: '28.5℃', 湿度: '62%', 风速: '3.2m/s' }
    },
    {
      id: 'DEV-CAM-001', kind: 'camera', icon: '📷', name: '视频采集 01',
      model: 'Hikvision DS-2CD', status: 'offline',
      ip: '192.168.10.51', version: 'cam-v5.7.2', heartbeat: '2026-07-20 09:42:11',
      role: '高点全景监控 · 视频流推送至边侧',
      metrics: { 码率: '0Mbps', 帧率: '0fps', 分辨率: '4K' }
    }
  ],
  edge: [
    {
      id: 'EDGE-JOB-001', kind: 'job', icon: '⚙️', name: '离线作业引擎',
      model: 'K3s Edge Node', status: 'online',
      ip: '10.20.0.11', version: 'edge-job-v1.2.0', heartbeat: '2026-07-20 10:31:40',
      role: '本地巡检任务编排 · 断网续传 · 边侧调度',
      metrics: { CPU: '42%', 内存: '58%', 任务: '6' }
    },
    {
      id: 'EDGE-PRE-001', kind: 'pre', icon: '🔄', name: '数据预处理',
      model: 'Flink Edge', status: 'online',
      ip: '10.20.0.12', version: 'pre-v2.1.0', heartbeat: '2026-07-20 10:31:42',
      role: '视频抽帧 · 图像去畸变 · 数据清洗标注',
      metrics: { CPU: '67%', 内存: '71%', 吞吐: '128MB/s' }
    },
    {
      id: 'EDGE-INF-001', kind: 'inf', icon: '🧠', name: 'AI 推理引擎',
      model: 'TensorRT ONNX', status: 'online',
      ip: '10.20.0.13', version: 'inf-v3.0.1', heartbeat: '2026-07-20 10:31:41',
      role: '本地实时识别 · 边缘告警 · 模型推理',
      metrics: { GPU: '54%', 推理: '32fps', 模型: '4' }
    },
    {
      id: 'EDGE-STORE-001', kind: 'store', icon: '💽', name: '本地存储',
      model: 'MinIO Edge', status: 'warn',
      ip: '10.20.0.14', version: 'store-v1.5.0', heartbeat: '2026-07-20 10:31:36',
      role: '断网数据缓存 · 增量同步至云端',
      metrics: { 容量: '1.8TB', 已用: '78%', IOPS: '4.2k' }
    }
  ],
  cloud: [
    {
      id: 'CLOUD-STORE-001', kind: 'cstore', icon: '☁️', name: '全量数据存储',
      model: 'MinIO Cluster', status: 'online',
      ip: '10.30.0.11', version: 'minio-v2.0', heartbeat: '2026-07-20 10:31:43',
      role: '巡检影像 · 告警 · 日志全量归档与冷热分层',
      metrics: { 容量: '128TB', 已用: '54%', IOPS: '12k' }
    },
    {
      id: 'CLOUD-TRAIN-001', kind: 'train', icon: '🎓', name: 'AI 模型训练',
      model: 'PyTorch + 8×A100', status: 'online',
      ip: '10.30.0.12', version: 'train-v1.4.0', heartbeat: '2026-07-20 10:31:42',
      role: '裂缝 / 漂浮物 / 渗漏 模型迭代训练',
      metrics: { GPU: '8×A100', 利用率: '76%', 任务: '2' }
    },
    {
      id: 'CLOUD-MGMT-001', kind: 'mgmt', icon: '🗂️', name: '模型管理',
      model: 'MLflow', status: 'online',
      ip: '10.30.0.13', version: 'mgmt-v2.2.0', heartbeat: '2026-07-20 10:31:41',
      role: '模型版本管理 · A/B 测试 · 灰度下发',
      metrics: { 模型: '4', 在线: '3', 草稿: '1' }
    },
    {
      id: 'CLOUD-REPORT-001', kind: 'report', icon: '📊', name: '报表服务',
      model: 'Grafana + ETL', status: 'online',
      ip: '10.30.0.14', version: 'report-v1.1.0', heartbeat: '2026-07-20 10:31:43',
      role: '日 / 周 / 月报生成 · BI 看板 · 数据出口',
      metrics: { 报表: '24', 模板: '8', 队列: '0' }
    },
    {
      id: 'CLOUD-USER-001', kind: 'user', icon: '👥', name: '用户中心',
      model: 'Keycloak', status: 'online',
      ip: '10.30.0.15', version: 'user-v3.0.0', heartbeat: '2026-07-20 10:31:42',
      role: '账号 · 角色 · 权限 · SSO 单点登录',
      metrics: { 用户: '156', 在线: '12', 租户: '3' }
    },
    {
      id: 'CLOUD-API-001', kind: 'gateway', icon: '🚪', name: 'API 网关',
      model: 'Kong Gateway', status: 'online',
      ip: '10.30.0.16', version: 'gw-v2.8.0', heartbeat: '2026-07-20 10:31:43',
      role: '统一入口 · 限流 · 鉴权 · 协议转换',
      metrics: { QPS: '4.2k', 错误率: '0.02%', 路由: '42' }
    }
  ]
};

const LAYER_META = {
  device: {
    title: '端侧 · 设备层',
    sub: 'Device Layer · 实时控制与数据采集',
    icon: '📡',
    tag: 'EDGE DEVICE',
    accent: 'var(--accent-cyan)'
  },
  edge: {
    title: '边侧 · 边缘层',
    sub: 'Edge Layer · 离线作业与数据预处理',
    icon: '🧩',
    tag: 'EDGE COMPUTE',
    accent: 'var(--warn)'
  },
  cloud: {
    title: '云侧 · 中心层',
    sub: 'Cloud Layer · 全量存储与 AI 模型管理',
    icon: '☁️',
    tag: 'CLOUD CORE',
    accent: 'var(--accent-electric)'
  }
};

const STATUS_LABEL = {
  online: '在线',
  warn: '告警',
  offline: '离线'
};

/* ====================================================================
 * 样式（命名空间 .ov- 防止污染）
 * ==================================================================== */
const STYLES = `
.ov-page { display: flex; flex-direction: column; gap: 18px; padding-bottom: 24px; }

.ov-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ov-header .page-title { font-size: var(--fs-2xl); }
.ov-header .page-subtitle { margin-bottom: 0; letter-spacing: 1px; }

.ov-legend { display: flex; align-items: center; gap: 14px; padding: 8px 14px;
  background: var(--bg-card); border: 1px solid var(--border-base);
  border-radius: var(--radius-md); backdrop-filter: blur(8px); }
.ov-legend__item { display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--fs-xs); color: var(--fg-secondary); letter-spacing: 0.5px; }

.ov-kpi { margin-bottom: 2px; }
.ov-kpi .kpi-card__extra { display: flex; align-items: center; gap: 6px;
  margin-top: 8px; font-size: var(--fs-xs); color: var(--fg-muted); }
.ov-kpi .kpi-card__icon { font-size: 22px; line-height: 1; filter: drop-shadow(0 0 6px var(--accent-cyan)); }

/* 架构图主容器 */
.ov-arch { display: flex; flex-direction: column; gap: 0; }

/* 层卡片 */
.ov-layer {
  position: relative;
  background: linear-gradient(135deg, rgba(17, 28, 54, 0.6) 0%, rgba(10, 18, 36, 0.4) 100%);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  padding: 16px 18px 18px;
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  animation: ovLayerIn var(--duration-base) var(--ease-out) both;
}
.ov-layer::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent 0%, var(--layer-accent, var(--accent-cyan)) 50%, transparent 100%);
  box-shadow: 0 0 12px var(--layer-accent, var(--accent-cyan));
}
.ov-layer::after {
  content: ''; position: absolute; top: -40%; right: -10%; width: 280px; height: 280px;
  background: radial-gradient(circle, var(--layer-glow, rgba(0, 229, 255, 0.08)) 0%, transparent 70%);
  pointer-events: none;
}
.ov-layer--device { --layer-accent: var(--accent-cyan); --layer-glow: rgba(0, 229, 255, 0.12); animation-delay: 60ms; }
.ov-layer--edge    { --layer-accent: var(--warn);        --layer-glow: rgba(255, 149, 0, 0.12);   animation-delay: 320ms; }
.ov-layer--cloud   { --layer-accent: var(--accent-electric); --layer-glow: rgba(77, 159, 255, 0.14); animation-delay: 580ms; }

.ov-layer__head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; position: relative; z-index: 1; }
.ov-layer__icon {
  width: 44px; height: 44px; border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center; font-size: 22px;
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid var(--border-base);
  box-shadow: inset 0 0 12px rgba(0, 229, 255, 0.15);
  filter: drop-shadow(0 0 6px var(--layer-accent));
  flex-shrink: 0;
}
.ov-layer--edge .ov-layer__icon    { background: rgba(255, 149, 0, 0.08); box-shadow: inset 0 0 12px rgba(255, 149, 0, 0.15); }
.ov-layer--cloud .ov-layer__icon   { background: rgba(77, 159, 255, 0.08); box-shadow: inset 0 0 12px rgba(77, 159, 255, 0.15); }

.ov-layer__title { font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 600;
  color: var(--fg-primary); letter-spacing: 1px; }
.ov-layer__sub   { font-size: var(--fs-xs); color: var(--fg-secondary); margin-top: 2px; letter-spacing: 0.5px; }

.ov-layer__tag {
  margin-left: auto; padding: 4px 10px;
  font-family: var(--font-display); font-size: var(--fs-xs); letter-spacing: 1px;
  color: var(--layer-accent);
  background: color-mix(in srgb, var(--layer-accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--layer-accent) 35%, transparent);
  border-radius: 999px;
  text-shadow: 0 0 8px var(--layer-accent);
}

/* 节点网格 */
.ov-nodes { display: grid; gap: 12px; position: relative; z-index: 1; }
.ov-nodes--device { grid-template-columns: repeat(4, 1fr); }
.ov-nodes--edge   { grid-template-columns: repeat(4, 1fr); }
.ov-nodes--cloud  { grid-template-columns: repeat(3, 1fr); }

@media (max-width: 1400px) {
  .ov-nodes--device { grid-template-columns: repeat(4, 1fr); }
  .ov-nodes--cloud  { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 1100px) {
  .ov-nodes--device, .ov-nodes--edge { grid-template-columns: repeat(2, 1fr); }
  .ov-nodes--cloud { grid-template-columns: repeat(2, 1fr); }
}

/* 节点卡片 */
.ov-node {
  position: relative;
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 12px 10px;
  background: rgba(10, 18, 36, 0.55);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  transition: transform var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out),
              background var(--duration-fast) var(--ease-out);
  overflow: hidden;
  animation: ovNodeIn var(--duration-base) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 60ms + 120ms);
}
.ov-node::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
  opacity: 0.6;
}
.ov-node:hover {
  border-color: var(--border-glow);
  background: rgba(0, 229, 255, 0.05);
  box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.2), 0 6px 24px rgba(0, 102, 255, 0.2);
  transform: translateY(-2px);
}
.ov-node.is-active {
  border-color: var(--accent-cyan);
  background: rgba(0, 229, 255, 0.08);
  box-shadow: 0 0 0 1px var(--accent-cyan), 0 0 24px rgba(0, 229, 255, 0.35);
}
.ov-node.is-active::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.06) 0%, transparent 60%);
  pointer-events: none;
}

.ov-node__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
.ov-node__icon {
  font-size: 22px; line-height: 1;
  filter: drop-shadow(0 0 6px rgba(0, 229, 255, 0.4));
}
.ov-node__status {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; color: var(--fg-muted);
  letter-spacing: 0.5px; text-transform: uppercase;
}
.ov-node__name { font-family: var(--font-display); font-size: var(--fs-sm); font-weight: 600;
  color: var(--fg-primary); letter-spacing: 0.5px; line-height: 1.3; }
.ov-node__model { font-size: var(--fs-xs); color: var(--fg-secondary); letter-spacing: 0.3px; }

.ov-node__metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 8px;
  padding-top: 8px; margin-top: auto; border-top: 1px dashed rgba(0, 229, 255, 0.12); }
.ov-metric { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ov-metric__label { font-size: 10px; color: var(--fg-muted); letter-spacing: 0.5px; }
.ov-metric__value { font-size: var(--fs-xs); color: var(--accent-cyan);
  font-family: var(--font-display); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 数据流向（层间连接线） */
.ov-flow {
  position: relative;
  height: 56px;
  margin: 0 auto;
  width: 100%;
  max-width: 720px;
  display: flex; align-items: center; justify-content: center;
}
.ov-flow__line {
  position: absolute;
  left: 12%; right: 12%; top: 50%;
  height: 2px;
  background-image: repeating-linear-gradient(
    90deg,
    var(--flow-color, var(--accent-cyan)) 0 8px,
    transparent 8px 18px
  );
  transform: translateY(-50%);
  opacity: 0.55;
}
.ov-flow__arrow {
  position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 0; height: 0;
  border-left: 8px solid transparent; border-right: 8px solid transparent;
  filter: drop-shadow(0 0 4px var(--flow-color, var(--accent-cyan)));
}
.ov-flow__arrow--up   { border-bottom: 10px solid var(--flow-color, var(--accent-cyan)); }
.ov-flow__arrow--down { border-top: 10px solid var(--flow-color, var(--accent-cyan)); }
.ov-flow__arrow--end-l { left: 12%; }
.ov-flow__arrow--end-r { left: 88%; }

.ov-flow__dot {
  position: absolute; top: 50%;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--flow-color, var(--accent-cyan));
  box-shadow: 0 0 10px var(--flow-color, var(--accent-cyan)),
              0 0 4px var(--flow-color, var(--accent-cyan));
  transform: translate(-50%, -50%);
  animation: ovDotRight 2.4s linear infinite;
  animation-delay: var(--delay, 0s);
}
.ov-flow__dot--rev { animation-name: ovDotLeft; }

.ov-flow__label {
  position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
  padding: 2px 10px;
  font-family: var(--font-display); font-size: 10px; letter-spacing: 1px;
  color: var(--flow-color, var(--accent-cyan));
  background: var(--bg-deep);
  border: 1px solid color-mix(in srgb, var(--flow-color, var(--accent-cyan)) 40%, transparent);
  border-radius: 999px;
  white-space: nowrap;
  text-shadow: 0 0 6px var(--flow-color, var(--accent-cyan));
}

.ov-flow--up   { --flow-color: var(--accent-cyan); }
.ov-flow--down { --flow-color: var(--accent-electric); }

.ov-flow-dual { display: flex; gap: 12%; height: 56px; align-items: center; justify-content: center;
  max-width: 720px; margin: 0 auto; }
.ov-flow-dual .ov-flow { flex: 1; height: 56px; max-width: none; }

@keyframes ovDotRight {
  0%   { left: 12%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { left: 88%; opacity: 0; }
}
@keyframes ovDotLeft {
  0%   { left: 88%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { left: 12%; opacity: 0; }
}
@keyframes ovLayerIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ovNodeIn {
  from { opacity: 0; transform: translateX(-12px) scale(0.96); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}

/* 节点详情面板（右侧滑入） */
.ov-detail {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 420px; max-width: 92vw;
  background: linear-gradient(180deg, rgba(17, 28, 54, 0.98) 0%, rgba(5, 9, 19, 0.98) 100%);
  border-left: 1px solid var(--border-glow);
  box-shadow: -16px 0 48px rgba(0, 0, 0, 0.6), -1px 0 0 var(--accent-cyan);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  z-index: 1000;
  transform: translateX(100%);
  transition: transform var(--duration-base) var(--ease-out);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.ov-detail.is-open { transform: translateX(0); }
.ov-detail::before {
  content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 2px;
  background: linear-gradient(180deg, var(--accent-cyan), var(--accent-electric), transparent);
  box-shadow: 0 0 12px var(--accent-cyan);
}

.ov-detail__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-base);
  flex-shrink: 0;
}
.ov-detail__title { font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 600;
  letter-spacing: 1px; color: var(--fg-primary); }
.ov-detail__close {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md);
  font-size: 22px; color: var(--fg-secondary);
  border: 1px solid var(--border-base);
  background: rgba(255, 255, 255, 0.03);
  transition: all var(--duration-fast) var(--ease-out);
}
.ov-detail__close:hover { color: var(--danger); border-color: rgba(255, 59, 107, 0.5);
  background: rgba(255, 59, 107, 0.12); }

.ov-detail__body { padding: 20px; overflow-y: auto; flex: 1; }

.ov-detail__hero {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px;
  background: rgba(0, 229, 255, 0.05);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  margin-bottom: 18px;
}
.ov-detail__hero-icon {
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  font-size: 30px;
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  filter: drop-shadow(0 0 8px var(--accent-cyan));
  flex-shrink: 0;
}
.ov-detail__hero-name { font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 600;
  color: var(--fg-primary); letter-spacing: 0.5px; }
.ov-detail__hero-model { font-size: var(--fs-sm); color: var(--fg-secondary); margin-top: 2px; }
.ov-detail__hero-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; }

.ov-detail__section { margin-bottom: 18px; }
.ov-detail__section-title {
  font-family: var(--font-display); font-size: var(--fs-xs);
  color: var(--accent-cyan); letter-spacing: 1.5px; text-transform: uppercase;
  margin-bottom: 10px; padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  display: flex; align-items: center; gap: 6px;
}
.ov-detail__section-title::before { content: '▸'; color: var(--accent-cyan); }

.ov-detail__kv { display: grid; grid-template-columns: 90px 1fr; gap: 8px 12px; font-size: var(--fs-sm); }
.ov-detail__kv dt { color: var(--fg-muted); letter-spacing: 0.5px; }
.ov-detail__kv dd { color: var(--fg-primary); font-family: var(--font-display);
  word-break: break-all; letter-spacing: 0.3px; }

.ov-detail__role {
  padding: 10px 12px;
  background: rgba(0, 229, 255, 0.05);
  border-left: 2px solid var(--accent-cyan);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: var(--fs-sm); color: var(--fg-primary); line-height: 1.6;
}

.ov-detail__metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ov-detail__metric {
  padding: 10px 8px;
  background: rgba(10, 18, 36, 0.6);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-sm);
  text-align: center;
}
.ov-detail__metric-label { display: block; font-size: 10px; color: var(--fg-muted); letter-spacing: 0.5px; margin-bottom: 4px; }
.ov-detail__metric-value { display: block; font-family: var(--font-display); font-size: var(--fs-base);
  color: var(--accent-cyan); font-weight: 600;
  text-shadow: 0 0 8px rgba(0, 229, 255, 0.4); }

.ov-detail-mask {
  position: fixed; inset: 0;
  background: rgba(5, 9, 19, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 999;
  opacity: 0; pointer-events: none;
  transition: opacity var(--duration-base) var(--ease-out);
}
.ov-detail-mask.is-open { opacity: 1; pointer-events: auto; }

/* KPI 加载占位 */
.ov-kpi-loading .kpi-card__value::after {
  content: '--'; color: var(--fg-muted);
}
`;

/* ====================================================================
 * 模板构造
 * ==================================================================== */
function renderNodes(layerKey) {
  return NODES[layerKey].map((node, i) => `
    <button class="ov-node" type="button"
            data-layer="${layerKey}" data-id="${node.id}"
            style="--i:${i}"
            aria-label="查看节点 ${node.name} 详情">
      <div class="ov-node__head">
        <span class="ov-node__icon">${node.icon}</span>
        <span class="ov-node__status">
          <span class="status-dot is-${node.status}"></span>
        </span>
      </div>
      <div class="ov-node__name">${node.name}</div>
      <div class="ov-node__model">${node.model}</div>
      <div class="ov-node__metrics">
        ${Object.entries(node.metrics).map(([k, v]) => `
          <div class="ov-metric">
            <span class="ov-metric__label">${k}</span>
            <span class="ov-metric__value">${v}</span>
          </div>
        `).join('')}
      </div>
    </button>
  `).join('');
}

function renderLayer(layerKey) {
  const meta = LAYER_META[layerKey];
  return `
    <div class="ov-layer ov-layer--${layerKey}">
      <div class="ov-layer__head">
        <div class="ov-layer__icon">${meta.icon}</div>
        <div>
          <div class="ov-layer__title">${meta.title}</div>
          <div class="ov-layer__sub">${meta.sub}</div>
        </div>
        <span class="ov-layer__tag">${meta.tag}</span>
      </div>
      <div class="ov-nodes ov-nodes--${layerKey}">
        ${renderNodes(layerKey)}
      </div>
    </div>
  `;
}

function renderFlow(direction, label) {
  // direction: 'up' | 'down'
  const cls = direction === 'up' ? 'ov-flow--up' : 'ov-flow--down';
  const arrowEnd = direction === 'up' ? 'ov-flow__arrow--up' : 'ov-flow__arrow--down';
  const dotRev = direction === 'down' ? ' ov-flow__dot--rev' : '';
  const dots = [0, 0.6, 1.2, 1.8]
    .map((d) => `<span class="ov-flow__dot${dotRev}" style="--delay:${d}s"></span>`)
    .join('');
  return `
    <div class="ov-flow ${cls}" aria-hidden="true">
      <div class="ov-flow__line"></div>
      <div class="ov-flow__arrow ${arrowEnd} ov-flow__arrow--end-r"></div>
      ${dots}
      <span class="ov-flow__label">${label}</span>
    </div>
  `;
}

function renderFlowDual(labelUp, labelDown) {
  return `
    <div class="ov-flow-dual" aria-hidden="true">
      ${renderFlow('up', labelUp)}
      ${renderFlow('down', labelDown)}
    </div>
  `;
}

function renderKPI(kpi) {
  const cards = [
    {
      label: '在线设备数',
      value: kpi.onlineDevices,
      unit: '台',
      delta: '↑ 较昨日 +2',
      deltaDir: 'up',
      icon: '🛩️'
    },
    {
      label: '今日告警数',
      value: kpi.alarms,
      unit: '条',
      delta: '↑ 待处理 4 条',
      deltaDir: 'down',
      icon: '⚠️'
    },
    {
      label: 'AI 识别准确率',
      value: kpi.accuracy,
      unit: '%',
      delta: '↑ 较上周 +0.4%',
      deltaDir: 'up',
      icon: '🎯'
    },
    {
      label: '今日巡检里程',
      value: kpi.mileage,
      unit: 'km',
      delta: '↑ 较昨日 +12.5km',
      deltaDir: 'up',
      icon: '📏'
    }
  ];
  return cards.map((c) => `
    <div class="kpi-card">
      <div class="kpi-card__label">${c.label}</div>
      <div class="kpi-card__value">
        <span data-kpi="${c.label}">${c.value}</span><span class="kpi-card__unit">${c.unit}</span>
      </div>
      <div class="kpi-card__delta ${c.deltaDir}">${c.delta}</div>
      <div class="kpi-card__extra">
        <span class="kpi-card__icon">${c.icon}</span>
        <span>实时同步</span>
      </div>
    </div>
  `).join('');
}

function template(kpi) {
  return `
    <section class="page ov-page">
      <header class="ov-header">
        <div>
          <h1 class="page-title">系统架构总览</h1>
          <p class="page-subtitle">端—边—云协同架构 · Edge-Cloud Collaborative Topology</p>
        </div>
        <div class="ov-legend">
          <span class="ov-legend__item"><span class="status-dot is-online"></span>在线</span>
          <span class="ov-legend__item"><span class="status-dot is-warn"></span>告警</span>
          <span class="ov-legend__item"><span class="status-dot is-offline"></span>离线</span>
        </div>
      </header>

      <div class="grid grid-4 ov-kpi">
        ${renderKPI(kpi)}
      </div>

      <div class="ov-arch">
        ${renderLayer('device')}
        ${renderFlow('up', '遥测数据 / 视频流上行')}
        ${renderLayer('edge')}
        ${renderFlowDual('聚合数据上行', '模型 / 配置下发')}
        ${renderLayer('cloud')}
      </div>
    </section>

    <aside class="ov-detail" id="ov-detail" aria-hidden="true">
      <div class="ov-detail__header">
        <span class="ov-detail__title">节点详情</span>
        <button class="ov-detail__close" id="ov-detail-close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="ov-detail__body" id="ov-detail-body"></div>
    </aside>
    <div class="ov-detail-mask" id="ov-detail-mask"></div>
  `;
}

function renderDetailBody(node, layerKey) {
  const meta = LAYER_META[layerKey];
  return `
    <div class="ov-detail__hero">
      <div class="ov-detail__hero-icon">${node.icon}</div>
      <div>
        <div class="ov-detail__hero-name">${node.name}</div>
        <div class="ov-detail__hero-model">${node.model}</div>
        <div class="ov-detail__hero-status">
          <span class="badge ${node.status === 'online' ? 'badge-success' : node.status === 'warn' ? 'badge-warn' : 'badge-danger'}">
            <span class="status-dot is-${node.status}"></span>
            ${STATUS_LABEL[node.status] || node.status}
          </span>
          <span class="badge">${meta.tag}</span>
        </div>
      </div>
    </div>

    <div class="ov-detail__section">
      <div class="ov-detail__section-title">基础信息</div>
      <dl class="ov-detail__kv">
        <dt>节点 ID</dt><dd>${node.id}</dd>
        <dt>IP 地址</dt><dd>${node.ip}</dd>
        <dt>软件版本</dt><dd>${node.version}</dd>
        <dt>最近心跳</dt><dd>${node.heartbeat}</dd>
        <dt>所属层级</dt><dd>${meta.title}</dd>
      </dl>
    </div>

    <div class="ov-detail__section">
      <div class="ov-detail__section-title">业务职责</div>
      <div class="ov-detail__role">${node.role}</div>
    </div>

    <div class="ov-detail__section">
      <div class="ov-detail__section-title">关键指标</div>
      <div class="ov-detail__metrics">
        ${Object.entries(node.metrics).map(([k, v]) => `
          <div class="ov-detail__metric">
            <span class="ov-detail__metric-label">${k}</span>
            <span class="ov-detail__metric-value">${v}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ====================================================================
 * 主渲染入口
 * ==================================================================== */
export function render(container) {
  // 注入样式（仅一次）
  if (!document.getElementById('ov-styles')) {
    const style = document.createElement('style');
    style.id = 'ov-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // 初始 KPI（占位）
  const initialKpi = {
    onlineDevices: '--',
    alarms: '--',
    accuracy: '--',
    mileage: '--'
  };

  container.innerHTML = template(initialKpi);

  // 绑定交互
  bindNodeClicks(container);
  bindDetailClose(container);

  // 异步加载 KPI
  loadKPIs(container);
}

/* ====================================================================
 * 交互绑定
 * ==================================================================== */
function bindNodeClicks(container) {
  container.querySelectorAll('.ov-node').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const layerKey = el.dataset.layer;
      const node = NODES[layerKey].find((n) => n.id === id);
      if (!node) return;

      // 标记激活态
      container.querySelectorAll('.ov-node.is-active').forEach((n) => n.classList.remove('is-active'));
      el.classList.add('is-active');

      openDetail(container, node, layerKey);
    });
  });
}

function bindDetailClose(container) {
  const panel = container.querySelector('#ov-detail');
  const mask = container.querySelector('#ov-detail-mask');
  const closeBtn = container.querySelector('#ov-detail-close');

  const close = () => {
    if (panel) panel.classList.remove('is-open');
    if (mask) mask.classList.remove('is-open');
    if (panel) panel.setAttribute('aria-hidden', 'true');
    container.querySelectorAll('.ov-node.is-active').forEach((n) => n.classList.remove('is-active'));
  };

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (mask) mask.addEventListener('click', close);

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && panel.classList.contains('is-open')) close();
  });
}

function openDetail(container, node, layerKey) {
  const panel = container.querySelector('#ov-detail');
  const body = container.querySelector('#ov-detail-body');
  const mask = container.querySelector('#ov-detail-mask');
  if (!panel || !body) return;

  body.innerHTML = renderDetailBody(node, layerKey);
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  if (mask) mask.classList.add('is-open');
}

/* ====================================================================
 * KPI 异步加载
 * ==================================================================== */
async function loadKPIs(container) {
  const setKPI = (label, value) => {
    const el = container.querySelector(`[data-kpi="${label}"]`);
    if (el) el.textContent = value;
  };

  try {
    const [dronesRes, alarmsRes] = await Promise.all([
      dronesApi.list(),
      fetch('/api/alarms', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json())
    ]);

    let drones = null;
    if (Array.isArray(dronesRes)) drones = dronesRes;
    else if (dronesRes && Array.isArray(dronesRes.data)) drones = dronesRes.data;
    else if (dronesRes && Array.isArray(dronesRes.items)) drones = dronesRes.items;
    else if (dronesRes && dronesRes.data && Array.isArray(dronesRes.data.items)) drones = dronesRes.data.items;

    const onlineCount = drones && drones.length 
      ? drones.filter((d) => {
          const s = d.status || d.state || '';
          return s && s !== 'offline' && s !== 'disconnected';
        }).length
      : 0;

    const alarmCount = alarmsRes && alarmsRes.data && Array.isArray(alarmsRes.data)
      ? alarmsRes.data.filter(a => a.status === 'pending').length
      : 0;

    setKPI('在线设备数', onlineCount || '--');
    setKPI('今日告警数', alarmCount || '0');
    setKPI('AI 识别准确率', '--');
    setKPI('今日巡检里程', '--');

  } catch (err) {
    console.warn('[overview] 加载 KPI 数据失败：', err.message || err);
    setKPI('在线设备数', '--');
    setKPI('今日告警数', '--');
    setKPI('AI 识别准确率', '--');
    setKPI('今日巡检里程', '--');
  }
}

export default { render };
