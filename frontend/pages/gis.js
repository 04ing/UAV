/* =====================================================================
 * gis.js — GIS 监控页 · Task 14
 * Leaflet 全屏地图 · 图层控制 · 实时告警 WebSocket
 * ===================================================================== */

import { drones, geoFences } from '/js/api.js';

/* =====================================================================
 * 模块级状态
 * ===================================================================== */
let mapInstance = null;
let wsAlarm = null;
let styleEl = null;
let intervals = [];
let layerGroups = {};
let alarmState = [];
let alarmIdSet = new Set();

/* =====================================================================
 * 兜底数据
 * ===================================================================== */
const FALLBACK = {
  drones: [
    { id: 'DRONE-001', model: 'DJI M350',        battery: 85, signal: '强', status: 'inspecting', lat: 30.6012, lng: 114.3025 },
    { id: 'DRONE-002', model: 'DJI M30T',        battery: 72, signal: '强', status: 'idle',       lat: 30.5980, lng: 114.2980 },
    { id: 'DRONE-003', model: 'DJI Matrice 300', battery: 45, signal: '中', status: 'returning',  lat: 30.6050, lng: 114.3100 },
    { id: 'DRONE-004', model: 'DJI M350',        battery: 90, signal: '强', status: 'idle',       lat: 30.5970, lng: 114.3050 },
    { id: 'DRONE-005', model: 'DJI M30T',        battery: 30, signal: '弱', status: 'returning',  lat: 30.6080, lng: 114.2970 },
    { id: 'DRONE-006', model: 'DJI Matrice 300', battery: 65, signal: '中', status: 'inspecting', lat: 30.6020, lng: 114.3150 },
    { id: 'DRONE-007', model: 'DJI M350',        battery: 0,  signal: '弱', status: 'offline',    lat: 30.5990, lng: 114.3000 }
  ],
  alarms: (() => {
    const now = Date.now();
    return [
      { id: 'ALARM-001', type: '裂缝',       severity: 'high',   droneId: 'DRONE-001', lat: 30.6015, lng: 114.3028, timestamp: now - 3600000, status: 'pending'    },
      { id: 'ALARM-002', type: '漂浮物',     severity: 'medium', droneId: 'DRONE-002', lat: 30.5985, lng: 114.2985, timestamp: now - 3300000, status: 'processing' },
      { id: 'ALARM-003', type: '渗漏',       severity: 'high',   droneId: 'DRONE-003', lat: 30.6055, lng: 114.3105, timestamp: now - 3000000, status: 'pending'    },
      { id: 'ALARM-004', type: '边坡滑塌',   severity: 'high',   droneId: 'DRONE-006', lat: 30.6025, lng: 114.3155, timestamp: now - 2700000, status: 'closed'     },
      { id: 'ALARM-005', type: '违章复垦',   severity: 'medium', droneId: 'DRONE-001', lat: 30.6018, lng: 114.3030, timestamp: now - 2400000, status: 'pending'    },
      { id: 'ALARM-006', type: '建筑物漏损', severity: 'low',    droneId: 'DRONE-002', lat: 30.5988, lng: 114.2990, timestamp: now - 2100000, status: 'closed'     },
      { id: 'ALARM-007', type: '人员入侵',   severity: 'high',   droneId: 'DRONE-006', lat: 30.6028, lng: 114.3160, timestamp: now - 1800000, status: 'processing' },
      { id: 'ALARM-008', type: '裂缝',       severity: 'medium', droneId: 'DRONE-003', lat: 30.6060, lng: 114.3110, timestamp: now - 1500000, status: 'pending'    },
      { id: 'ALARM-009', type: '漂浮物',     severity: 'low',    droneId: 'DRONE-001', lat: 30.6020, lng: 114.3035, timestamp: now - 1200000, status: 'closed'     },
      { id: 'ALARM-010', type: '渗漏',       severity: 'medium', droneId: 'DRONE-006', lat: 30.6030, lng: 114.3165, timestamp: now - 900000,  status: 'processing' }
    ];
  })(),
  geoFences: [
    { id: 'GEOFENCE-001', name: '大坝核心区', polygon: [{lat:30.6012,lng:114.3025},{lat:30.6050,lng:114.3050},{lat:30.6030,lng:114.3100},{lat:30.5990,lng:114.3070}], type: 'restricted' },
    { id: 'GEOFENCE-002', name: '库区禁飞区', polygon: [{lat:30.5980,lng:114.2980},{lat:30.6020,lng:114.2990},{lat:30.6010,lng:114.3030},{lat:30.5970,lng:114.3010}], type: 'no-fly' },
    { id: 'GEOFENCE-003', name: '管理区',     polygon: [{lat:30.5970,lng:114.3050},{lat:30.5990,lng:114.3060},{lat:30.5990,lng:114.3080},{lat:30.5970,lng:114.3070}], type: 'restricted' }
  ],
  routes: [
    [[30.6012,114.3025],[30.6020,114.3050],[30.6010,114.3075],[30.6000,114.3050]],
    [[30.5980,114.2980],[30.5990,114.3010],[30.5970,114.3030]],
    [[30.6020,114.3150],[30.6030,114.3160],[30.6040,114.3170]]
  ]
};

/* =====================================================================
 * 工具函数
 * ===================================================================== */
function unwrap(res, fallback) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.items)) return res.items;
  if (res && res.data && Array.isArray(res.data.list)) return res.data.list;
  return fallback;
}

function fmtTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function severityInfo(sev) {
  switch ((sev || '').toLowerCase()) {
    case 'high':
    case 'critical': return { color: 'var(--danger)', label: '高', cls: 'badge-danger' };
    case 'medium':
    case 'warn':     return { color: 'var(--warn)',   label: '中', cls: 'badge-warn' };
    case 'low':
    case 'info':     return { color: 'var(--success)',label: '低', cls: 'badge-success' };
    default:         return { color: 'var(--fg-secondary)', label: sev || '未知', cls: '' };
  }
}

function droneStatusInfo(status) {
  switch ((status || '').toLowerCase()) {
    case 'inspecting': return { label: '巡检中', dot: 'is-online' };
    case 'idle':       return { label: '待机',   dot: 'is-idle' };
    case 'returning':  return { label: '返航',   dot: 'is-warn' };
    case 'offline':    return { label: '离线',   dot: 'is-offline' };
    default:           return { label: status || '--', dot: '' };
  }
}

function openWS(path, onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}${path}`;
  const ws = new WebSocket(url);
  ws.onmessage = (event) => {
    if (typeof onMessage !== 'function') return;
    let payload = event.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { /* 非 JSON 保持原值 */ }
    }
    onMessage(payload);
  };
  ws.onerror = (err) => console.error(`[ws] ${path} error:`, err);
  return ws;
}

function bearingFrom(p1, p2) {
  const dLng = p2[1] - p1[1];
  const dLat = p2[0] - p1[0];
  let deg = Math.atan2(dLng, dLat) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/* =====================================================================
 * 清理
 * ===================================================================== */
function cleanup() {
  if (wsAlarm) {
    try { wsAlarm.close(); } catch (_) {}
    wsAlarm = null;
  }
  if (mapInstance) {
    try { mapInstance.remove(); } catch (_) {}
    mapInstance = null;
  }
  layerGroups = {};
  intervals.forEach((id) => clearInterval(id));
  intervals = [];
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
  alarmState = [];
  alarmIdSet = new Set();
}

/* =====================================================================
 * 样式注入
 * ===================================================================== */
function injectStyles() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', 'gis');
  styleEl.textContent = `
/* ---------- 页面骨架 ---------- */
.gis-page {
  position: relative;
  width: 100%;
  height: calc(100vh - var(--topbar-height) - var(--statusbar-height) - 40px);
  min-height: 520px;
  display: flex;
  flex-direction: column;
}
.gis-map {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg);
  background: var(--bg-deep);
  overflow: hidden;
}

/* Leaflet 深色覆写 */
.gis-map .leaflet-container {
  background: var(--bg-deep) !important;
  font-family: var(--font-body);
}
.gis-map .leaflet-control-attribution {
  background: rgba(5, 9, 19, 0.7) !important;
  color: var(--fg-muted) !important;
  font-size: 10px !important;
}
.gis-map .leaflet-control-attribution a { color: var(--fg-secondary) !important; }
.gis-map .leaflet-bar a {
  background: rgba(10, 18, 36, 0.9) !important;
  color: var(--accent-cyan) !important;
  border-color: var(--border-base) !important;
}
.gis-map .leaflet-bar a:hover { background: rgba(0, 229, 255, 0.15) !important; }
.gis-map .leaflet-popup-content-wrapper {
  background: rgba(10, 18, 36, 0.95);
  color: var(--fg-primary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-glow);
}
.gis-map .leaflet-popup-tip { background: rgba(10, 18, 36, 0.95); }
.gis-map .leaflet-popup-content { margin: 10px 14px; font-size: var(--fs-sm); line-height: 1.6; }
.gis-map .leaflet-popup-content b { color: var(--accent-cyan); }

/* ---------- 图层控制面板 ---------- */
.gis-layer-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 500;
  background: rgba(5, 9, 19, 0.88);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--shadow-card);
  min-width: 160px;
  overflow: hidden;
  transition: width var(--duration-fast) var(--ease-out);
}
.gis-layer-panel.collapsed .gis-layer-panel__body { display: none; }
.gis-layer-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  color: var(--accent-cyan);
  letter-spacing: 1px;
  border-bottom: 1px solid var(--border-base);
}
.gis-layer-panel__header:hover { background: rgba(0, 229, 255, 0.05); }
.gis-layer-panel__toggle {
  font-size: 12px;
  transition: transform var(--duration-fast) var(--ease-out);
  color: var(--fg-secondary);
}
.gis-layer-panel.collapsed .gis-layer-panel__toggle { transform: rotate(-90deg); }
.gis-layer-panel__body { padding: 8px 12px; }
.gis-layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  cursor: pointer;
}
.gis-layer-item input[type="checkbox"] {
  accent-color: var(--accent-cyan);
  width: 14px;
  height: 14px;
  cursor: pointer;
}

/* ---------- 图例面板 ---------- */
.gis-legend {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 500;
  background: rgba(5, 9, 19, 0.88);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--shadow-card);
  min-width: 140px;
  padding: 10px 12px;
}
.gis-legend__title {
  font-family: var(--font-display);
  color: var(--accent-cyan);
  font-weight: 600;
  letter-spacing: 1px;
  margin-bottom: 8px;
  font-size: var(--fs-sm);
}
.gis-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
}
.gis-legend__swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.gis-legend__swatch--line {
  border-radius: 0;
  height: 2px;
  background: var(--accent-cyan);
  border: none;
}
.gis-legend__swatch--dash {
  border-radius: 0;
  height: 0;
  border-top: 2px dashed var(--accent-cyan);
  background: transparent;
}
.gis-legend__swatch--poly {
  border-radius: 2px;
  opacity: 0.5;
}

/* ---------- 底部状态栏 ---------- */
.gis-statusbar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: rgba(5, 9, 19, 0.85);
  border-top: 1px solid var(--border-glow);
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
  font-family: var(--font-display);
  letter-spacing: 0.5px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.gis-statusbar__group { display: flex; align-items: center; gap: 16px; }
.gis-statusbar__item { display: flex; align-items: center; gap: 6px; }
.gis-statusbar__label { color: var(--fg-muted); }
.gis-statusbar__value { color: var(--accent-cyan); }

/* ---------- 右侧告警面板 ---------- */
.gis-alarm-panel {
  position: absolute;
  top: 220px;
  bottom: 38px;
  right: 12px;
  z-index: 500;
  width: 280px;
  display: flex;
  flex-direction: column;
  background: rgba(5, 9, 19, 0.88);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  transition: transform var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
}
.gis-alarm-panel.collapsed {
  transform: translateX(calc(100% + 20px));
  opacity: 0;
  pointer-events: none;
}
.gis-alarm-tab {
  position: absolute;
  top: 220px;
  right: 12px;
  z-index: 499;
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(5, 9, 19, 0.88);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  color: var(--danger);
  font-size: 18px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--shadow-card);
}
.gis-alarm-tab:hover { background: rgba(255, 59, 107, 0.15); }
.gis-alarm-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-base);
  cursor: pointer;
  user-select: none;
}
.gis-alarm-panel__header h3 {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--fg-primary);
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gis-alarm-panel__header h3::before {
  content: '';
  width: 4px;
  height: 14px;
  background: linear-gradient(180deg, var(--danger), var(--warn));
  border-radius: var(--radius-sm);
  box-shadow: 0 0 6px var(--danger);
}
.gis-alarm-panel__count {
  font-family: var(--font-display);
  color: var(--danger);
  font-size: var(--fs-lg);
  font-weight: 700;
}
.gis-alarm-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gis-alarm-panel__empty {
  text-align: center;
  color: var(--fg-muted);
  padding: 24px 8px;
  font-size: var(--fs-sm);
}

/* ---------- 无人机标记 ---------- */
.gis-drone-marker {
  position: relative;
  width: 28px;
  height: 28px;
}
.gis-drone-marker__core {
  position: absolute;
  inset: 6px;
  background: var(--accent-cyan);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--accent-cyan), 0 0 4px var(--accent-cyan);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--bg-deep);
  font-weight: 800;
  font-family: var(--font-display);
  z-index: 2;
}
.gis-drone-marker__pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--accent-cyan);
  opacity: 0.5;
  animation: gisDronePulse 2s ease-out infinite;
}
.gis-drone-marker.is-inspecting .gis-drone-marker__core,
.gis-drone-marker.is-online .gis-drone-marker__core   { background: var(--success); box-shadow: 0 0 10px var(--success); }
.gis-drone-marker.is-inspecting .gis-drone-marker__pulse,
.gis-drone-marker.is-online .gis-drone-marker__pulse  { background: var(--success); }
.gis-drone-marker.is-returning .gis-drone-marker__core  { background: var(--warn); box-shadow: 0 0 10px var(--warn); }
.gis-drone-marker.is-returning .gis-drone-marker__pulse { background: var(--warn); }
.gis-drone-marker.is-idle .gis-drone-marker__core  { background: var(--accent-cyan); box-shadow: 0 0 8px var(--accent-cyan); }
.gis-drone-marker.is-idle .gis-drone-marker__pulse { background: var(--accent-cyan); animation-duration: 3s; }
.gis-drone-marker.is-offline .gis-drone-marker__core  { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
.gis-drone-marker.is-offline .gis-drone-marker__pulse { background: var(--danger); animation: none; opacity: 0.3; }
@keyframes gisDronePulse {
  0%   { transform: scale(0.6); opacity: 0.7; }
  100% { transform: scale(2.5); opacity: 0; }
}

/* ---------- 告警标记 ---------- */
.gis-alarm-marker {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--fg-primary);
  box-shadow: 0 0 12px currentColor;
}
.gis-alarm-marker.high   { background: var(--danger);  color: var(--danger); }
.gis-alarm-marker.medium { background: var(--warn);    color: var(--warn); }
.gis-alarm-marker.low    { background: var(--success); color: var(--success); }
.gis-alarm-marker--flash { animation: gisAlarmFlash 1s ease-out; }
@keyframes gisAlarmFlash {
  0%   { transform: scale(1);   opacity: 1; }
  50%  { transform: scale(2.2); opacity: 0.7; }
  100% { transform: scale(1);   opacity: 1; }
}

/* ---------- 航线箭头 ---------- */
.gis-route-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
}
.gis-route-arrow__tri {
  width: 0;
  height: 0;
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-bottom: 7px solid var(--accent-cyan);
  opacity: 0.7;
}

/* ---------- 告警列表项 ---------- */
.gis-alarm-item {
  padding: 8px 10px;
  background: rgba(10, 18, 36, 0.5);
  border: 1px solid var(--border-base);
  border-left: 3px solid var(--fg-muted);
  border-radius: var(--radius-md);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 6px;
  font-size: var(--fs-sm);
  transition: border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
  cursor: pointer;
}
.gis-alarm-item:hover {
  background: rgba(0, 229, 255, 0.05);
  border-color: var(--border-glow);
}
.gis-alarm-item.high   { border-left-color: var(--danger); }
.gis-alarm-item.medium { border-left-color: var(--warn); }
.gis-alarm-item.low    { border-left-color: var(--success); }
.gis-alarm-item.is-new { animation: gisAlarmItemFlash 0.9s var(--ease-out); }
@keyframes gisAlarmItemFlash {
  0%   { opacity: 0; transform: translateX(20px); background: rgba(255, 59, 107, 0.25); }
  50%  { background: rgba(255, 59, 107, 0.12); }
  100% { opacity: 1; transform: translateX(0); background: rgba(10, 18, 36, 0.5); }
}
.gis-alarm-item__type { color: var(--fg-primary); font-weight: 600; }
.gis-alarm-item__time { color: var(--fg-secondary); font-family: var(--font-display); font-size: var(--fs-xs); text-align: right; font-variant-numeric: tabular-nums; }
.gis-alarm-item__meta { display: flex; align-items: center; gap: 6px; color: var(--fg-muted); font-size: var(--fs-xs); }
.gis-alarm-item__loc  { color: var(--fg-secondary); font-size: var(--fs-xs); font-family: var(--font-display); grid-column: 1 / -1; }

/* ---------- 响应式 ---------- */
@media (max-width: 1280px) {
  .gis-alarm-panel { width: 240px; }
}
@media (prefers-reduced-motion: reduce) {
  .gis-drone-marker__pulse, .gis-alarm-marker--flash, .gis-alarm-item.is-new { animation: none !important; }
}
`;
  document.head.appendChild(styleEl);
}

/* =====================================================================
 * 地图初始化
 * ===================================================================== */
function initMap(droneList, fenceList, routeList, alarmList) {
  if (mapInstance) {
    try { mapInstance.remove(); } catch (_) {}
    mapInstance = null;
  }
  const mapEl = document.getElementById('gis-map');
  if (!mapEl || !window.L) {
    console.warn('[gis] Leaflet 未加载或地图容器缺失');
    return;
  }

  mapInstance = window.L.map(mapEl, {
    center: [30.6012, 114.3050],
    zoom: 14,
    zoomControl: true,
    attributionControl: true
  });

  // 深色底图
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(mapInstance);

  // 初始化图层组
  layerGroups.drones = window.L.layerGroup().addTo(mapInstance);
  layerGroups.routes = window.L.layerGroup().addTo(mapInstance);
  layerGroups.alarms = window.L.layerGroup().addTo(mapInstance);
  layerGroups.fences = window.L.layerGroup().addTo(mapInstance);

  renderFences(fenceList);
  renderRoutes(routeList);
  renderAlarms(alarmList);
  renderDrones(droneList);

  // 自动适配视野
  if (droneList.length) {
    try {
      const bounds = window.L.latLngBounds(droneList.map((d) => [d.lat, d.lng]));
      mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } catch (_) {}
  }

  // 鼠标坐标
  const latEl = document.getElementById('gis-mouse-lat');
  const lngEl = document.getElementById('gis-mouse-lng');
  mapInstance.on('mousemove', (e) => {
    if (latEl) latEl.textContent = e.latlng.lat.toFixed(5);
    if (lngEl) lngEl.textContent = e.latlng.lng.toFixed(5);
  });

  // 缩放级别
  const zoomEl = document.getElementById('gis-zoom');
  const updateZoom = () => { if (zoomEl) zoomEl.textContent = mapInstance.getZoom(); };
  mapInstance.on('zoomend', updateZoom);
  updateZoom();

  // 要素数量
  mapInstance.on('layeradd layerremove', updateStatusBar);
  updateStatusBar();

  setTimeout(() => {
    if (mapInstance) {
      try { mapInstance.invalidateSize(); } catch (_) {}
    }
  }, 250);
}

/* =====================================================================
 * 图层渲染
 * ===================================================================== */
function renderDrones(list) {
  if (!layerGroups.drones) return;
  layerGroups.drones.clearLayers();
  list.forEach((drone) => {
    if (drone.lat == null || drone.lng == null) return;
    const status = (drone.status || '').toLowerCase();
    const info = droneStatusInfo(drone.status);
    const num = (drone.id || '').replace('DRONE-', '');
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="gis-drone-marker is-${status}">
        <div class="gis-drone-marker__pulse"></div>
        <div class="gis-drone-marker__core">${num}</div>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    const popup = `<b>${drone.id}</b><br>
      机型: ${drone.model || '--'}<br>
      状态: ${info.label}<br>
      电量: ${drone.battery ?? '--'}%<br>
      信号: ${drone.signal || '--'}`;
    window.L.marker([drone.lat, drone.lng], { icon, zIndexOffset: 1000 })
      .bindPopup(popup)
      .addTo(layerGroups.drones);
  });
}

function renderRoutes(list) {
  if (!layerGroups.routes) return;
  layerGroups.routes.clearLayers();
  list.forEach((route, idx) => {
    if (!Array.isArray(route) || route.length < 2) return;
    const latlngs = route.map((p) => (Array.isArray(p) ? p : [p.lat, p.lng]));
    window.L.polyline(latlngs, {
      color: 'var(--accent-cyan)',
      weight: 1.5,
      opacity: 0.55,
      dashArray: '6 4'
    }).bindPopup(`巡检航线 ${idx + 1}`).addTo(layerGroups.routes);

    // 方向箭头
    for (let i = 0; i < latlngs.length - 1; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[i + 1];
      const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const deg = bearingFrom(p1, p2);
      const arrowIcon = window.L.divIcon({
        className: 'gis-route-arrow',
        html: `<div class="gis-route-arrow__tri" style="transform:rotate(${deg}deg)"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      });
      window.L.marker(mid, { icon: arrowIcon, interactive: false }).addTo(layerGroups.routes);
    }
  });
}

function renderAlarms(list, flashIds = []) {
  if (!layerGroups.alarms) return;
  layerGroups.alarms.clearLayers();
  list.forEach((alarm) => {
    if (alarm.lat == null || alarm.lng == null) return;
    const sev = (alarm.severity || '').toLowerCase();
    const info = severityInfo(alarm.severity);
    const isFlash = flashIds.includes(alarm.id);
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="gis-alarm-marker ${sev} ${isFlash ? 'gis-alarm-marker--flash' : ''}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    const popup = `<b>${alarm.type || '告警'}</b><br>
      级别: ${info.label}<br>
      无人机: ${alarm.droneId || '--'}<br>
      时间: ${fmtDateTime(alarm.timestamp)}<br>
      状态: ${alarm.status || '--'}`;
    window.L.marker([alarm.lat, alarm.lng], { icon })
      .bindPopup(popup)
      .addTo(layerGroups.alarms);
  });
}

function renderFences(list) {
  if (!layerGroups.fences) return;
  layerGroups.fences.clearLayers();
  list.forEach((gf) => {
    if (!gf.polygon || gf.polygon.length < 3) return;
    const latlngs = gf.polygon.map((p) => [p.lat, p.lng]);
    const color = gf.type === 'no-fly' ? 'var(--danger)' : 'var(--warn)';
    window.L.polygon(latlngs, {
      color,
      weight: 2,
      opacity: 0.85,
      fillColor: color,
      fillOpacity: 0.12,
      dashArray: '6 3'
    }).bindPopup(
      `<b>${gf.name}</b><br>类型: ${gf.type === 'no-fly' ? '禁飞区' : '限制区'}`
    ).addTo(layerGroups.fences);
  });
}

/* =====================================================================
 * 图层控制
 * ===================================================================== */
function toggleLayer(name, visible) {
  if (!mapInstance || !layerGroups[name]) return;
  if (visible) {
    if (!mapInstance.hasLayer(layerGroups[name])) mapInstance.addLayer(layerGroups[name]);
  } else {
    if (mapInstance.hasLayer(layerGroups[name])) mapInstance.removeLayer(layerGroups[name]);
  }
  updateStatusBar();
}

function setupLayerControl() {
  const header = document.getElementById('gis-layer-header');
  const panel = document.getElementById('gis-layer-panel');
  if (header && panel) {
    header.addEventListener('click', () => panel.classList.toggle('collapsed'));
  }
  ['drones', 'routes', 'alarms', 'fences'].forEach((name) => {
    const cb = document.getElementById(`layer-${name}`);
    if (cb) cb.addEventListener('change', (e) => toggleLayer(name, e.target.checked));
  });
}

/* =====================================================================
 * 状态栏
 * ===================================================================== */
function updateStatusBar() {
  const countEl = document.getElementById('gis-feature-count');
  if (!countEl || !mapInstance) return;
  let count = 0;
  Object.keys(layerGroups).forEach((k) => {
    const g = layerGroups[k];
    if (g && mapInstance.hasLayer(g)) count += g.getLayers().length;
  });
  countEl.textContent = String(count);
}

/* =====================================================================
 * 告警面板
 * ===================================================================== */
function renderAlarmPanel() {
  const body = document.getElementById('gis-alarm-body');
  const countEl = document.getElementById('gis-alarm-count');
  if (!body) return;
  const list = alarmState.slice(0, 10);
  if (countEl) countEl.textContent = String(alarmState.length);
  if (!list.length) {
    body.innerHTML = '<div class="gis-alarm-panel__empty">暂无告警</div>';
    return;
  }
  body.innerHTML = list.map((a, i) => {
    const sev = (a.severity || '').toLowerCase();
    const sevInfo = severityInfo(a.severity);
    const lat = a.lat != null ? Number(a.lat).toFixed(4) : '--';
    const lng = a.lng != null ? Number(a.lng).toFixed(4) : '--';
    const isNew = a._isNew && i === 0;
    return `
      <div class="gis-alarm-item ${sev} ${isNew ? 'is-new' : ''}" data-id="${a.id}">
        <div class="gis-alarm-item__type">${a.type || '未知告警'}</div>
        <div class="gis-alarm-item__time">${fmtTime(a.timestamp)}</div>
        <div class="gis-alarm-item__meta">
          <span class="badge ${sevInfo.cls}">${sevInfo.label}</span>
          <span>${a.droneId || '--'}</span>
        </div>
        <div class="gis-alarm-item__loc">📍 ${lat}, ${lng}</div>
      </div>
    `;
  }).join('');

  // 清除 is-new 标记（下次渲染不再闪）
  alarmState.forEach((a) => delete a._isNew);
}

function prependAlarm(alarm) {
  alarm._isNew = true;
  alarmState.unshift(alarm);
  if (alarmState.length > 50) alarmState = alarmState.slice(0, 50);
  alarmIdSet.add(alarm.id);

  // 刷新地图告警图层（仅保留最新 30 个，避免堆积）
  const mapAlarms = alarmState.slice(0, 30);
  renderAlarms(mapAlarms, [alarm.id]);
  renderAlarmPanel();
  updateStatusBar();
}

function setupAlarmPanelToggle() {
  const header = document.getElementById('gis-alarm-header');
  const panel = document.getElementById('gis-alarm-panel');
  const tab = document.getElementById('gis-alarm-tab');
  if (header && panel) {
    header.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      if (tab) tab.style.display = panel.classList.contains('collapsed') ? 'flex' : 'none';
    });
  }
  if (tab && panel) {
    tab.addEventListener('click', () => {
      panel.classList.remove('collapsed');
      tab.style.display = 'none';
    });
  }
}

/* =====================================================================
 * WebSocket
 * ===================================================================== */
function setupWebSocket() {
  wsAlarm = openWS('/ws/alarm', (msg) => {
    const alarm = msg && msg.data ? msg.data : msg;
    if (!alarm || !alarm.type) return;
    const newAlarm = {
      ...alarm,
      id: `${alarm.id}-${Date.now()}`,
      timestamp: (msg && msg.timestamp) || Date.now()
    };
    if (alarmIdSet.has(newAlarm.id)) return;
    prependAlarm(newAlarm);
  });
}

/* =====================================================================
 * render —— 主入口
 * ===================================================================== */
export function render(container) {
  cleanup();
  injectStyles();

  container.innerHTML = `
    <section class="page gis-page">
      <div class="gis-map" id="gis-map"></div>

      <!-- 图层控制 -->
      <div class="gis-layer-panel" id="gis-layer-panel">
        <div class="gis-layer-panel__header" id="gis-layer-header">
          <span>图层控制</span>
          <span class="gis-layer-panel__toggle">▼</span>
        </div>
        <div class="gis-layer-panel__body">
          <label class="gis-layer-item">
            <input type="checkbox" id="layer-drones" checked>
            <span>无人机位置</span>
          </label>
          <label class="gis-layer-item">
            <input type="checkbox" id="layer-routes" checked>
            <span>航线轨迹</span>
          </label>
          <label class="gis-layer-item">
            <input type="checkbox" id="layer-alarms" checked>
            <span>告警点位</span>
          </label>
          <label class="gis-layer-item">
            <input type="checkbox" id="layer-fences" checked>
            <span>电子围栏</span>
          </label>
        </div>
      </div>

      <!-- 图例 -->
      <div class="gis-legend">
        <div class="gis-legend__title">图例</div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch" style="background:var(--success);box-shadow:0 0 6px var(--success);"></span>
          <span>在线无人机</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch" style="background:var(--warn);box-shadow:0 0 6px var(--warn);"></span>
          <span>返航中</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch" style="background:var(--danger);box-shadow:0 0 6px var(--danger);"></span>
          <span>离线无人机</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch" style="background:var(--danger);"></span>
          <span>高危告警</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch" style="background:var(--warn);"></span>
          <span>中危告警</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch" style="background:var(--success);"></span>
          <span>低危告警</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch gis-legend__swatch--dash" style="border-color:var(--accent-cyan);"></span>
          <span>巡检航线</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch gis-legend__swatch--poly" style="background:var(--warn);"></span>
          <span>限制区</span>
        </div>
        <div class="gis-legend__item">
          <span class="gis-legend__swatch gis-legend__swatch--poly" style="background:var(--danger);"></span>
          <span>禁飞区</span>
        </div>
      </div>

      <!-- 底部状态栏 -->
      <div class="gis-statusbar">
        <div class="gis-statusbar__group">
          <div class="gis-statusbar__item">
            <span class="gis-statusbar__label">经度:</span>
            <span class="gis-statusbar__value" id="gis-mouse-lng">--</span>
          </div>
          <div class="gis-statusbar__item">
            <span class="gis-statusbar__label">纬度:</span>
            <span class="gis-statusbar__value" id="gis-mouse-lat">--</span>
          </div>
        </div>
        <div class="gis-statusbar__group">
          <div class="gis-statusbar__item">
            <span class="gis-statusbar__label">缩放:</span>
            <span class="gis-statusbar__value" id="gis-zoom">--</span>
          </div>
          <div class="gis-statusbar__item">
            <span class="gis-statusbar__label">要素:</span>
            <span class="gis-statusbar__value" id="gis-feature-count">0</span>
          </div>
        </div>
      </div>

      <!-- 右侧告警面板 -->
      <div class="gis-alarm-panel" id="gis-alarm-panel">
        <div class="gis-alarm-panel__header" id="gis-alarm-header">
          <h3>实时告警</h3>
          <span class="gis-alarm-panel__count" id="gis-alarm-count">0</span>
        </div>
        <div class="gis-alarm-panel__body" id="gis-alarm-body">
          <div class="gis-alarm-panel__empty">加载中...</div>
        </div>
      </div>

      <!-- 告警面板折叠态按钮 -->
      <div class="gis-alarm-tab" id="gis-alarm-tab" title="展开告警面板">⚠️</div>
    </section>
  `;

  // 加载数据
  Promise.allSettled([
    drones.list(),
    geoFences.list()
  ]).then(([drRes, gfRes]) => {
    const droneList = drRes.status === 'fulfilled' ? unwrap(drRes.value, FALLBACK.drones) : FALLBACK.drones;
    const fenceList = gfRes.status === 'fulfilled' ? unwrap(gfRes.value, FALLBACK.geoFences) : FALLBACK.geoFences;
    const routeList = FALLBACK.routes;

    // 初始化告警状态（按时间倒序）
    alarmState = [...FALLBACK.alarms].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    alarmState.forEach((a) => alarmIdSet.add(a.id));

    initMap(droneList, fenceList, routeList, alarmState.slice(0, 30));
    setupLayerControl();
    renderAlarmPanel();
    setupAlarmPanelToggle();
    setupWebSocket();
  }).catch((err) => {
    console.error('[gis] 数据加载失败:', err);
    const body = document.getElementById('gis-alarm-body');
    if (body) body.innerHTML = '<div class="gis-alarm-panel__empty">数据加载失败</div>';
  });
}

export default { render };
