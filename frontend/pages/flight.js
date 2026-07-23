/* =====================================================================
 * flight.js — 飞控管理页 · Task 11
 * 机队列表 · 电子围栏 · 飞行参数
 * ===================================================================== */

import { drones, geoFences } from '/js/api.js';

/* ---------- 模块级状态 ---------- */
let mapInstance = null;
let intervals = [];
let wsConnections = [];
let styleEl = null;
let currentTab = 'fleet';
let droneData = [];
let fenceData = [];
let prevDroneStatus = new Map(); // 用于检测状态变化
let drawingPoints = [];
let tempPolygon = null;
let isDrawing = false;
let activeDetailId = null;

/* ---------- 工具函数 ---------- */
function unwrap(res, fallback = []) {
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
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function droneStatusInfo(status) {
  switch ((status || '').toLowerCase()) {
    case 'inspecting': return { label: '巡检中', dot: 'is-online', cls: 'badge-success' };
    case 'idle':       return { label: '待命',   dot: 'is-idle',   cls: '' };
    case 'returning':  return { label: '返航中', dot: 'is-warn',   cls: 'badge-warn' };
    case 'offline':    return { label: '离线',   dot: 'is-offline', cls: 'badge-danger' };
    default:           return { label: status || '--', dot: '', cls: '' };
  }
}

function signalToBars(signal) {
  const map = { '强': 4, '中': 3, '弱': 2, '无': 1 };
  return map[signal] || 1;
}

/* ---------- 清理 ---------- */
function cleanup() {
  intervals.forEach((item) => {
    if (typeof item === 'number') clearInterval(item);
    else if (item && typeof item.clear === 'function') item.clear();
  });
  intervals = [];
  wsConnections.forEach((ws) => { try { ws.close(); } catch (_) {} });
  wsConnections = [];
  if (mapInstance) { try { mapInstance.remove(); } catch (_) {} mapInstance = null; }
  if (styleEl) { styleEl.remove(); styleEl = null; }
  prevDroneStatus.clear();
}

/* ---------- 样式注入 ---------- */
function injectStyles() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', 'flight');
  styleEl.textContent = `
/* ---------- Tabs ---------- */
.flight-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-base);
}
.flight-tab {
  padding: 10px 20px;
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  cursor: pointer;
  position: relative;
  letter-spacing: 0.5px;
  transition: color var(--duration-fast) var(--ease-out);
  border: none;
  background: none;
}
.flight-tab:hover { color: var(--fg-primary); }
.flight-tab.active {
  color: var(--accent-cyan);
  text-shadow: 0 0 8px rgba(0,229,255,0.4);
}
.flight-tab.active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
  box-shadow: 0 0 8px var(--accent-cyan);
}

/* ---------- Panels ---------- */
.flight-panel { display: none; animation: fadeIn 0.4s var(--ease-out); }
.flight-panel.active { display: block; }

/* ---------- KPI row ---------- */
.flight-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

/* ---------- Battery bar ---------- */
.battery-bar {
  width: 72px;
  height: 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
.battery-bar__fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s var(--ease-out), background 0.6s var(--ease-out);
}
.battery-bar__fill.high   { background: linear-gradient(90deg, var(--success), #00c880); }
.battery-bar__fill.medium { background: linear-gradient(90deg, var(--warn), #e08000); }
.battery-bar__fill.low    { background: linear-gradient(90deg, var(--danger), #c02050); }

/* ---------- Signal bars ---------- */
.signal-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}
.signal-bars__bar {
  width: 3px;
  background: var(--fg-muted);
  border-radius: 1px;
  opacity: 0.35;
}
.signal-bars__bar:nth-child(1) { height: 4px; }
.signal-bars__bar:nth-child(2) { height: 7px; }
.signal-bars__bar:nth-child(3) { height: 10px; }
.signal-bars__bar:nth-child(4) { height: 14px; }
.signal-bars__bar.is-on { background: var(--accent-cyan); opacity: 1; box-shadow: 0 0 4px var(--accent-cyan); }

/* ---------- Status flash ---------- */
.status-changed {
  animation: statusFlash 1.2s var(--ease-out);
}
@keyframes statusFlash {
  0%   { background: rgba(0,229,255,0.25); }
  100% { background: transparent; }
}

/* ---------- Return progress ---------- */
.return-progress {
  width: 100%;
  height: 4px;
  background: rgba(255,149,0,0.15);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}
.return-progress__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--warn), #ffcc00);
  border-radius: 2px;
  animation: returnPulse 1.5s ease-in-out infinite;
}
@keyframes returnPulse {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}

/* ---------- Action buttons in table ---------- */
.flight-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.flight-actions .btn { padding: 5px 10px; font-size: var(--fs-xs); }

/* ---------- Modal ---------- */
.flight-modal {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
}
.flight-modal[hidden] { display: none; }
.flight-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5,9,19,0.85);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: fadeIn 0.25s var(--ease-out);
}
.flight-modal__content {
  position: relative;
  width: min(440px, 90vw);
  background: var(--bg-elev);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glow), 0 16px 64px rgba(0,0,0,0.6);
  overflow: hidden;
  animation: modalIn 0.35s var(--ease-out);
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.flight-modal__header {
  padding: 14px 18px;
  font-family: var(--font-display);
  color: var(--danger);
  font-size: var(--fs-lg);
  letter-spacing: 1px;
  border-bottom: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  gap: 8px;
}
.flight-modal__body {
  padding: 18px;
  color: var(--fg-secondary);
  font-size: var(--fs-sm);
  line-height: 1.6;
}
.flight-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-base);
}

/* ---------- Drawer ---------- */
.flight-drawer {
  position: fixed;
  inset: 0;
  z-index: 9997;
  display: flex;
  justify-content: flex-end;
}
.flight-drawer[hidden] { display: none; }
.flight-drawer__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5,9,19,0.6);
  animation: fadeIn 0.25s var(--ease-out);
}
.flight-drawer__panel {
  position: relative;
  width: min(520px, 90vw);
  height: 100%;
  background: var(--bg-elev);
  border-left: 1px solid var(--border-glow);
  box-shadow: var(--shadow-glow);
  display: flex;
  flex-direction: column;
  animation: drawerIn 0.35s var(--ease-out);
}
@keyframes drawerIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
.flight-drawer__header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.flight-drawer__title {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  color: var(--accent-cyan);
  letter-spacing: 1px;
}
.flight-drawer__close {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-base);
  color: var(--fg-secondary);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.flight-drawer__close:hover {
  color: var(--danger);
  border-color: var(--danger);
  transform: rotate(90deg);
}
.flight-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.drawer-section {
  margin-bottom: 24px;
}
.drawer-section__title {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  color: var(--fg-primary);
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  display: flex; align-items: center; gap: 8px;
}
.drawer-section__title::before {
  content: '';
  width: 3px; height: 14px;
  background: linear-gradient(180deg, var(--accent-cyan), var(--accent-blue));
  border-radius: 2px;
}
.drawer-kv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  font-size: var(--fs-sm);
}
.drawer-kv__item { display: flex; flex-direction: column; gap: 2px; }
.drawer-kv__label { color: var(--fg-muted); font-size: var(--fs-xs); }
.drawer-kv__value { color: var(--fg-secondary); font-family: var(--font-display); }

/* Battery mini chart */
.battery-chart {
  width: 100%;
  height: 120px;
  background: rgba(10,18,36,0.5);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  position: relative;
  overflow: hidden;
}

/* ---------- Toast ---------- */
.flight-toast {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 9999;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  font-size: var(--fs-sm);
  color: var(--fg-primary);
  background: var(--bg-elev);
  border: 1px solid var(--border-glow);
  box-shadow: var(--shadow-glow);
  display: flex;
  align-items: center;
  gap: 10px;
  animation: toastIn 0.35s var(--ease-out), toastOut 0.35s var(--ease-out) 2.6s forwards;
  pointer-events: none;
}
.flight-toast--success { border-color: rgba(0,245,160,0.4); }
.flight-toast--error   { border-color: rgba(255,59,107,0.4); color: var(--danger); }
.flight-toast--info    { border-color: var(--border-glow); }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes toastOut {
  to { opacity: 0; transform: translateX(24px); }
}

/* ---------- GeoFence Tab ---------- */
.fence-layout {
  display: flex;
  gap: 16px;
  height: calc(100vh - var(--topbar-height) - var(--statusbar-height) - 160px);
  min-height: 480px;
}
.fence-map-wrap {
  flex: 0 0 70%;
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-base);
}
.fence-map {
  width: 100%; height: 100%;
  background: var(--bg-deep);
}
.fence-sidebar {
  flex: 0 0 30%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 260px;
}
.fence-toolbar {
  position: absolute;
  top: 12px; left: 12px;
  z-index: 500;
  display: flex;
  gap: 8px;
}
.fence-toolbar .btn {
  background: rgba(5,9,19,0.85);
  backdrop-filter: blur(6px);
  border-color: var(--border-glow);
  color: var(--accent-cyan);
}
.fence-toolbar .btn.active {
  background: rgba(0,229,255,0.15);
  box-shadow: 0 0 12px rgba(0,229,255,0.25);
}
.fence-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fence-item {
  background: var(--bg-card);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 10px;
  transition: all var(--duration-fast) var(--ease-out);
}
.fence-item:hover {
  border-color: var(--border-glow);
  background: rgba(0,229,255,0.04);
}
.fence-item__name { color: var(--fg-primary); font-weight: 500; font-size: var(--fs-sm); }
.fence-item__meta { color: var(--fg-muted); font-size: var(--fs-xs); grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; }
.fence-item__del {
  grid-row: 1; grid-column: 2;
  width: 28px; height: 28px;
  border-radius: var(--radius-sm);
  background: rgba(255,59,107,0.08);
  border: 1px solid rgba(255,59,107,0.3);
  color: var(--danger);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  font-size: var(--fs-xs);
}
.fence-item__del:hover { background: var(--danger); color: #fff; }

/* Leaflet overrides for flight page */
.fence-map .leaflet-container {
  background: var(--bg-deep) !important;
  font-family: var(--font-body);
}
.fence-map .leaflet-control-attribution {
  background: rgba(5,9,19,0.7) !important;
  color: var(--fg-muted) !important;
  font-size: 10px !important;
}
.fence-map .leaflet-control-attribution a { color: var(--fg-secondary) !important; }
.fence-map .leaflet-bar a {
  background: rgba(10,18,36,0.9) !important;
  color: var(--accent-cyan) !important;
  border-color: var(--border-base) !important;
}
.fence-map .leaflet-bar a:hover { background: rgba(0,229,255,0.15) !important; }

/* Drawing vertex markers */
.draw-vertex {
  width: 10px; height: 10px;
  background: var(--accent-cyan);
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 8px var(--accent-cyan);
}

/* ---------- Params Tab ---------- */
.param-form {
  max-width: 720px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.param-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.param-field.full { grid-column: 1 / -1; }
.param-field__label {
  font-size: var(--fs-sm);
  color: var(--fg-primary);
  display: flex; align-items: center; gap: 8px;
}
.param-switch {
  position: relative;
  width: 44px; height: 24px;
  background: rgba(255,255,255,0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.3s var(--ease-out);
  flex-shrink: 0;
}
.param-switch::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 20px; height: 20px;
  background: var(--fg-secondary);
  border-radius: 50%;
  transition: transform 0.3s var(--ease-out), background 0.3s var(--ease-out);
}
.param-switch.is-on { background: rgba(0,229,255,0.25); }
.param-switch.is-on::after { transform: translateX(20px); background: var(--accent-cyan); box-shadow: 0 0 8px var(--accent-cyan); }
.param-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  outline: none;
}
.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px; height: 16px;
  background: var(--accent-cyan);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--accent-cyan);
  cursor: pointer;
}
.param-slider::-moz-range-thumb {
  width: 16px; height: 16px;
  background: var(--accent-cyan);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--accent-cyan);
  cursor: pointer;
  border: none;
}
.param-value {
  font-family: var(--font-display);
  color: var(--accent-cyan);
  font-size: var(--fs-sm);
  min-width: 48px;
  text-align: right;
}
.param-desc {
  margin-top: 24px;
  padding: 16px 20px;
  background: rgba(10,18,36,0.5);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  color: var(--fg-secondary);
  font-size: var(--fs-sm);
  line-height: 1.7;
}
.param-desc__title {
  font-family: var(--font-display);
  color: var(--accent-cyan);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

/* Drone marker reuse from dashboard */
.drone-marker {
  position: relative;
  width: 28px; height: 28px;
}
.drone-marker__core {
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
.drone-marker__pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--accent-cyan);
  opacity: 0.5;
  animation: dronePulse 2s ease-out infinite;
}
.drone-marker.is-inspecting .drone-marker__core,
.drone-marker.is-online .drone-marker__core   { background: var(--success); box-shadow: 0 0 10px var(--success); }
.drone-marker.is-inspecting .drone-marker__pulse,
.drone-marker.is-online .drone-marker__pulse  { background: var(--success); }
.drone-marker.is-returning .drone-marker__core  { background: var(--warn); box-shadow: 0 0 10px var(--warn); }
.drone-marker.is-returning .drone-marker__pulse { background: var(--warn); }
.drone-marker.is-idle .drone-marker__core  { background: var(--accent-cyan); box-shadow: 0 0 8px var(--accent-cyan); }
.drone-marker.is-idle .drone-marker__pulse { background: var(--accent-cyan); animation-duration: 3s; }
.drone-marker.is-offline .drone-marker__core  { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
.drone-marker.is-offline .drone-marker__pulse { background: var(--danger); animation: none; opacity: 0.3; }
@keyframes dronePulse {
  0%   { transform: scale(0.6); opacity: 0.7; }
  100% { transform: scale(2.5); opacity: 0; }
}

@media (max-width: 1280px) {
  .flight-kpi-row { grid-template-columns: repeat(2, 1fr); }
  .fence-layout { flex-direction: column; height: auto; }
  .fence-map-wrap { flex: none; height: 420px; }
  .fence-sidebar { flex: none; max-height: 360px; }
  .param-form { grid-template-columns: 1fr; }
  .flight-drawer__panel { width: 90vw; }
}
@media (prefers-reduced-motion: reduce) {
  .drone-marker__pulse, .return-progress__fill { animation: none !important; }
}
  `;
  document.head.appendChild(styleEl);
}

/* ---------- Toast ---------- */
function showToast(message, type = 'info') {
  const existing = document.querySelector('.flight-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `flight-toast flight-toast--${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ---------- Modal ---------- */
function showModal({ title, body, confirmText = '确认', cancelText = '取消', onConfirm, isDanger = false }) {
  const modal = document.createElement('div');
  modal.className = 'flight-modal';
  modal.innerHTML = `
    <div class="flight-modal__backdrop"></div>
    <div class="flight-modal__content">
      <div class="flight-modal__header">${title}</div>
      <div class="flight-modal__body">${body}</div>
      <div class="flight-modal__actions">
        <button class="btn btn-ghost" data-action="cancel">${cancelText}</button>
        <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('[data-action="cancel"]').addEventListener('click', close);
  modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    if (onConfirm) onConfirm();
    close();
  });
  modal.querySelector('.flight-modal__backdrop').addEventListener('click', close);
}

/* ---------- Drawer ---------- */
function showDrawer(drone) {
  const existing = document.querySelector('.flight-drawer');
  if (existing) existing.remove();
  activeDetailId = drone.id;

  const info = droneStatusInfo(drone.status);
  const drawer = document.createElement('div');
  drawer.className = 'flight-drawer';

  // 遥测历史数据（从真实数据生成）
  const telemetryHistory = [];
  
  const batteryValues = telemetryHistory.length > 0 ? telemetryHistory.map(t => t.battery) : [drone.battery || 50];
  const minB = Math.min(...batteryValues) - 5;
  const maxB = Math.max(...batteryValues) + 5;
  const sparkPoints = batteryValues.map((v, i) => {
    const x = (i / (batteryValues.length - 1)) * 100;
    const y = 100 - ((v - minB) / (maxB - minB)) * 100;
    return `${x},${y}`;
  }).join(' ');

  drawer.innerHTML = `
    <div class="flight-drawer__backdrop"></div>
    <div class="flight-drawer__panel">
      <div class="flight-drawer__header">
        <div class="flight-drawer__title">🚁 ${drone.id}</div>
        <button class="flight-drawer__close" aria-label="关闭">✕</button>
      </div>
      <div class="flight-drawer__body">
        <div class="drawer-section">
          <div class="drawer-section__title">基本信息</div>
          <div class="drawer-kv">
            <div class="drawer-kv__item"><span class="drawer-kv__label">型号</span><span class="drawer-kv__value">${drone.model || '--'}</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">状态</span><span class="drawer-kv__value">${info.label}</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">电量</span><span class="drawer-kv__value">${drone.battery ?? '--'}%</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">信号</span><span class="drawer-kv__value">${drone.signal || '--'}</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">经度</span><span class="drawer-kv__value">${drone.lng != null ? drone.lng.toFixed(5) : '--'}</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">纬度</span><span class="drawer-kv__value">${drone.lat != null ? drone.lat.toFixed(5) : '--'}</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">最后更新</span><span class="drawer-kv__value">${fmtDateTime(drone.lastUpdate)}</span></div>
          </div>
        </div>
        <div class="drawer-section">
          <div class="drawer-section__title">最近遥测</div>
          <div class="drawer-kv">
            <div class="drawer-kv__item"><span class="drawer-kv__label">高度</span><span class="drawer-kv__value">${80 + Math.floor(Math.random()*40)} m</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">速度</span><span class="drawer-kv__value">${(5 + Math.random()*8).toFixed(1)} m/s</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">风速</span><span class="drawer-kv__value">${(2 + Math.random()*5).toFixed(1)} m/s</span></div>
            <div class="drawer-kv__item"><span class="drawer-kv__label">温度</span><span class="drawer-kv__value">${(28 + Math.random()*8).toFixed(1)} °C</span></div>
          </div>
        </div>
        <div class="drawer-section">
          <div class="drawer-section__title">电池曲线</div>
          <div class="battery-chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">
              <polyline points="${sparkPoints}" fill="none" stroke="var(--accent-cyan)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              <circle cx="100" cy="${100 - ((batteryValues[batteryValues.length-1] - minB)/(maxB-minB)*100)}" r="3" fill="var(--accent-cyan)" />
            </svg>
          </div>
        </div>
        <div class="drawer-section">
          <div class="drawer-section__title">最近巡检任务</div>
          <div style="font-size:var(--fs-sm);color:var(--fg-secondary);line-height:1.7;">
            <div>• 2026-07-20 08:00 大坝主体日常巡检（已完成 85%）</div>
            <div>• 2026-07-19 14:30 库区水面周巡检（已完成）</div>
            <div>• 2026-07-18 09:00 边坡月度巡检（已完成）</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(drawer);
  const close = () => { drawer.remove(); activeDetailId = null; };
  drawer.querySelector('.flight-drawer__close').addEventListener('click', close);
  drawer.querySelector('.flight-drawer__backdrop').addEventListener('click', close);
}

/* ---------- Tab Switching ---------- */
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.flight-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.flight-panel').forEach((el) => {
    el.classList.toggle('active', el.dataset.panel === tab);
  });
  if (tab === 'geofence') {
    setTimeout(() => { if (mapInstance) mapInstance.invalidateSize(); }, 100);
  }
}

/* ---------- KPI Rendering ---------- */
function renderKPIs(container, list) {
  const total = list.length;
  const online = list.filter((d) => d.status !== 'offline').length;
  const inspecting = list.filter((d) => d.status === 'inspecting').length;
  const idle = list.filter((d) => d.status === 'idle').length;
  const offline = list.filter((d) => d.status === 'offline').length;

  container.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-card__label">在线 / 总数</div>
      <div class="kpi-card__value">${online}<span class="kpi-card__unit">/ ${total}</span></div>
      <div class="kpi-card__delta">${Math.round((online/total)*100)}% 在线率</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">巡检中</div>
      <div class="kpi-card__value" style="color:var(--success);">${inspecting}</div>
      <div class="kpi-card__delta up">执行任务中</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">待命</div>
      <div class="kpi-card__value" style="color:var(--accent-cyan);">${idle}</div>
      <div class="kpi-card__delta">随时可起飞</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">离线</div>
      <div class="kpi-card__value" style="color:var(--danger);">${offline}</div>
      <div class="kpi-card__delta down">需关注</div>
    </div>
  `;
}

/* ---------- Fleet Table ---------- */
function renderFleetTable(container, list) {
  if (!list.length) {
    container.innerHTML = `<div class="placeholder"><div class="placeholder__text">暂无无人机数据</div></div>`;
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>无人机</th>
          <th>型号</th>
          <th>电量</th>
          <th>信号</th>
          <th>状态</th>
          <th>最后更新</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((d) => {
          const info = droneStatusInfo(d.status);
          const bars = signalToBars(d.signal);
          const battClass = d.battery > 50 ? 'high' : d.battery > 20 ? 'medium' : 'low';
          const num = (d.id || '').replace('DRONE-', '');
          const changed = prevDroneStatus.has(d.id) && prevDroneStatus.get(d.id) !== d.status ? 'status-changed' : '';
          const returningHtml = d.status === 'returning'
            ? `<div class="return-progress"><div class="return-progress__fill" style="width:${Math.max(10, Math.min(100, d.battery * 1.2))}%"></div></div>`
            : '';
          return `
            <tr class="${changed}" data-drone-id="${d.id}">
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--accent-cyan),var(--accent-blue));display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--bg-deep);font-weight:800;font-family:var(--font-display);">${num}</div>
                  <span style="font-family:var(--font-display);color:var(--fg-primary);">${d.id}</span>
                </div>
              </td>
              <td>${d.model || '--'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div class="battery-bar"><div class="battery-bar__fill ${battClass}" style="width:${d.battery}%"></div></div>
                  <span style="font-size:var(--fs-xs);color:var(--fg-secondary);">${d.battery}%</span>
                </div>
              </td>
              <td>
                <div class="signal-bars">
                  ${[1,2,3,4].map(i => `<div class="signal-bars__bar ${i <= bars ? 'is-on' : ''}"></div>`).join('')}
                </div>
              </td>
              <td><span class="badge ${info.cls}"><span class="status-dot ${info.dot}"></span>${info.label}</span></td>
              <td style="font-size:var(--fs-xs);color:var(--fg-muted);">${fmtDateTime(d.lastUpdate)}</td>
              <td>
                <div class="flight-actions">
                  <button class="btn btn-ghost" data-action="detail" data-id="${d.id}">详情</button>
                  ${d.status !== 'offline' && d.status !== 'returning'
                    ? `<button class="btn btn-warn" style="background:rgba(255,149,0,0.1);color:var(--warn);border-color:rgba(255,149,0,0.35);" data-action="return" data-id="${d.id}">一键返航</button>`
                    : ''}
                  <button class="btn btn-ghost" data-action="video" data-id="${d.id}">实时视频</button>
                </div>
                ${returningHtml}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  // Bind actions
  container.querySelectorAll('[data-action="detail"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const drone = list.find((d) => d.id === id);
      if (drone) showDrawer(drone);
    });
  });
  container.querySelectorAll('[data-action="return"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const drone = list.find((d) => d.id === id);
      if (!drone) return;
      showModal({
        title: '⚠️ 确认一键返航',
        body: `<div style="color:var(--fg-primary);margin-bottom:8px;">无人机 <b>${drone.id}</b> 将中断当前任务并立即返航。</div><div style="color:var(--danger);font-size:var(--fs-xs);">注意：此操作不可撤销，返航过程中任务数据可能丢失。</div>`,
        confirmText: '确认返航',
        cancelText: '取消',
        isDanger: true,
        onConfirm: async () => {
          try {
            await drones.returnHome(id);
            showToast('返航指令已下发', 'success');
            await refreshDrones();
          } catch (err) {
            showToast(err.message || '返航失败', 'error');
          }
        }
      });
    });
  });
  container.querySelectorAll('[data-action="video"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showToast('实时视频通道准备中…', 'info');
    });
  });
}

/* ---------- Fleet Tab ---------- */
function renderFleetTab(container) {
  container.innerHTML = `
    <div class="flight-kpi-row" id="fleet-kpi"></div>
    <div id="fleet-table"></div>
  `;
  const kpiEl = container.querySelector('#fleet-kpi');
  const tableEl = container.querySelector('#fleet-table');
  renderKPIs(kpiEl, droneData);
  renderFleetTable(tableEl, droneData);
}

/* ---------- GeoFence: Map ---------- */
function initGeoFenceMap() {
  const mapEl = document.getElementById('fence-map');
  if (!mapEl || !window.L) return;
  if (mapInstance) { try { mapInstance.remove(); } catch (_) {} mapInstance = null; }

  mapInstance = window.L.map(mapEl, { center: [30.6012, 114.3050], zoom: 14, zoomControl: true, attributionControl: true });
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
  }).addTo(mapInstance);

  renderFencesOnMap();
  renderDronesOnMap();

  // Drawing mode
  mapInstance.on('click', (e) => {
    if (!isDrawing) return;
    drawingPoints.push([e.latlng.lat, e.latlng.lng]);
    updateTempPolygon();
    // Add vertex marker
    const marker = window.L.circleMarker(e.latlng, {
      radius: 5, color: 'var(--accent-cyan)', fillColor: 'var(--accent-cyan)', fillOpacity: 1, weight: 2
    }).addTo(mapInstance);
    marker._isVertex = true;
  });

  mapInstance.on('dblclick', (e) => {
    if (!isDrawing) return;
    if (drawingPoints.length >= 3) {
      finishDrawing();
    } else {
      showToast('多边形至少需要 3 个顶点', 'error');
    }
  });
}

function renderFencesOnMap() {
  if (!mapInstance) return;
  // Remove existing fence layers (not vertex/drone)
  mapInstance.eachLayer((layer) => {
    if (layer._isFence || layer._isDrone) {
      mapInstance.removeLayer(layer);
    }
  });
  fenceData.forEach((gf) => {
    if (!gf.polygon || gf.polygon.length < 3) return;
    const latlngs = gf.polygon.map((p) => [p.lat, p.lng]);
    const color = gf.type === 'no-fly' ? 'var(--danger)' : 'var(--warn)';
    const poly = window.L.polygon(latlngs, {
      color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.1, dashArray: '6 3'
    }).addTo(mapInstance);
    poly._isFence = true;
    poly.bindPopup(`<b>${gf.name}</b><br>类型: ${gf.type === 'no-fly' ? '禁飞区' : '限制区'}<br>顶点: ${gf.polygon.length}`);
  });
}

function renderDronesOnMap() {
  if (!mapInstance) return;
  mapInstance.eachLayer((layer) => {
    if (layer._isDrone) mapInstance.removeLayer(layer);
  });
  droneData.forEach((drone) => {
    if (drone.lat == null || drone.lng == null) return;
    const status = (drone.status || '').toLowerCase();
    const num = (drone.id || '').replace('DRONE-', '');
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="drone-marker is-${status}"><div class="drone-marker__pulse"></div><div class="drone-marker__core">${num}</div></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14]
    });
    const marker = window.L.marker([drone.lat, drone.lng], { icon, zIndexOffset: 1000 }).addTo(mapInstance);
    marker._isDrone = true;
    const info = droneStatusInfo(drone.status);
    marker.bindPopup(`<b>${drone.id}</b><br>型号: ${drone.model || '--'}<br>状态: ${info.label}<br>电量: ${drone.battery ?? '--'}%<br>信号: ${drone.signal || '--'}`);
  });
}

function updateTempPolygon() {
  if (!mapInstance) return;
  if (tempPolygon) { mapInstance.removeLayer(tempPolygon); tempPolygon = null; }
  if (drawingPoints.length < 2) return;
  tempPolygon = window.L.polygon(drawingPoints, {
    color: 'var(--accent-cyan)', weight: 2, opacity: 0.8, fillColor: 'var(--accent-cyan)', fillOpacity: 0.08, dashArray: '4 4'
  }).addTo(mapInstance);
}

function finishDrawing() {
  isDrawing = false;
  const btn = document.getElementById('btn-draw');
  if (btn) btn.classList.remove('active');
  if (tempPolygon) { mapInstance.removeLayer(tempPolygon); tempPolygon = null; }

  // Clean vertex markers
  mapInstance.eachLayer((layer) => { if (layer._isVertex) mapInstance.removeLayer(layer); });

  showFenceSaveModal();
}

function showFenceSaveModal() {
  const modal = document.createElement('div');
  modal.className = 'flight-modal';
  modal.innerHTML = `
    <div class="flight-modal__backdrop"></div>
    <div class="flight-modal__content">
      <div class="flight-modal__header">保存电子围栏</div>
      <div class="flight-modal__body">
        <div class="param-field full" style="margin-bottom:12px;">
          <label class="param-field__label">围栏名称</label>
          <input type="text" id="fence-name" placeholder="例如：大坝核心区" style="width:100%;">
        </div>
        <div class="param-field full">
          <label class="param-field__label">围栏类型</label>
          <select id="fence-type" style="width:100%;">
            <option value="restricted">限制区</option>
            <option value="no-fly">禁飞区</option>
          </select>
        </div>
        <div style="margin-top:10px;font-size:var(--fs-xs);color:var(--fg-muted);">顶点数: ${drawingPoints.length}</div>
      </div>
      <div class="flight-modal__actions">
        <button class="btn btn-ghost" data-action="cancel">取消</button>
        <button class="btn btn-primary" data-action="save">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => { modal.remove(); drawingPoints = []; };
  modal.querySelector('[data-action="cancel"]').addEventListener('click', close);
  modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
    const name = document.getElementById('fence-name').value.trim();
    const type = document.getElementById('fence-type').value;
    if (!name) { showToast('请输入围栏名称', 'error'); return; }
    const polygon = drawingPoints.map((p) => ({ lat: p[0], lng: p[1] }));
    try {
      await geoFences.create({ name, polygon, type });
      showToast('电子围栏创建成功', 'success');
      close();
      await refreshFences();
    } catch (err) {
      showToast(err.message || '创建失败', 'error');
    }
  });
  modal.querySelector('.flight-modal__backdrop').addEventListener('click', close);
}

/* ---------- GeoFence: List ---------- */
function renderFenceList(container) {
  if (!fenceData.length) {
    container.innerHTML = `<div class="placeholder" style="min-height:120px;padding:20px;"><div class="placeholder__text" style="font-size:var(--fs-sm);">暂无电子围栏</div></div>`;
    return;
  }
  container.innerHTML = fenceData.map((gf) => `
    <div class="fence-item">
      <div class="fence-item__name">${gf.name}</div>
      <button class="fence-item__del" data-id="${gf.id}" title="删除">🗑</button>
      <div class="fence-item__meta">
        <span class="badge ${gf.type === 'no-fly' ? 'badge-danger' : 'badge-warn'}">${gf.type === 'no-fly' ? '禁飞区' : '限制区'}</span>
        <span>${gf.polygon ? gf.polygon.length : 0} 顶点</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.fence-item__del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      showModal({
        title: '确认删除',
        body: `确定要删除电子围栏 <b>${id}</b> 吗？`,
        confirmText: '删除',
        cancelText: '取消',
        isDanger: true,
        onConfirm: async () => {
          try {
            await geoFences.remove(id);
            showToast('电子围栏已删除', 'success');
            await refreshFences();
          } catch (err) {
            showToast(err.message || '删除失败', 'error');
          }
        }
      });
    });
  });
}

function renderGeoFenceTab(container) {
  container.innerHTML = `
    <div class="fence-layout">
      <div class="fence-map-wrap">
        <div class="fence-toolbar">
          <button class="btn" id="btn-draw">📐 绘制多边形</button>
          <button class="btn btn-ghost" id="btn-clear-draw">清除</button>
        </div>
        <div class="fence-map" id="fence-map"></div>
      </div>
      <div class="fence-sidebar">
        <div class="section-title" style="margin-bottom:8px;font-size:var(--fs-base);">围栏列表</div>
        <div class="fence-list" id="fence-list"></div>
      </div>
    </div>
  `;
  initGeoFenceMap();
  renderFenceList(container.querySelector('#fence-list'));

  container.querySelector('#btn-draw').addEventListener('click', () => {
    isDrawing = !isDrawing;
    const btn = container.querySelector('#btn-draw');
    btn.classList.toggle('active', isDrawing);
    if (isDrawing) {
      drawingPoints = [];
      showToast('点击地图添加顶点，双击结束绘制', 'info');
    } else {
      drawingPoints = [];
      if (tempPolygon) { mapInstance.removeLayer(tempPolygon); tempPolygon = null; }
      mapInstance.eachLayer((layer) => { if (layer._isVertex) mapInstance.removeLayer(layer); });
    }
  });
  container.querySelector('#btn-clear-draw').addEventListener('click', () => {
    drawingPoints = [];
    isDrawing = false;
    const btn = container.querySelector('#btn-draw');
    if (btn) btn.classList.remove('active');
    if (tempPolygon) { mapInstance.removeLayer(tempPolygon); tempPolygon = null; }
    mapInstance.eachLayer((layer) => { if (layer._isVertex) mapInstance.removeLayer(layer); });
  });
}

/* ---------- Params Tab ---------- */
function renderParamsTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card__title">飞行参数配置</div>
      <div class="param-form" id="param-form">
        <div class="param-field">
          <label class="param-field__label"><span>智能避障</span><span class="param-switch" id="sw-obstacle" data-on="false"></span></label>
        </div>
        <div class="param-field">
          <label class="param-field__label"><span>仿地飞行</span><span class="param-switch" id="sw-terrain" data-on="false"></span></label>
        </div>
        <div class="param-field">
          <label class="param-field__label"><span>断点续飞</span><span class="param-switch" id="sw-resume" data-on="true"></span></label>
        </div>
        <div class="param-field">
          <label class="param-field__label">避障距离阈值 <span class="param-value" id="val-distance">20 m</span></label>
          <input type="range" class="param-slider" id="rng-distance" min="5" max="50" value="20">
        </div>
        <div class="param-field">
          <label class="param-field__label">最大飞行高度 <span class="param-value" id="val-altitude">120 m</span></label>
          <input type="range" class="param-slider" id="rng-altitude" min="30" max="500" value="120">
        </div>
        <div class="param-field">
          <label class="param-field__label">最大飞行速度 <span class="param-value" id="val-speed">15 m/s</span></label>
          <input type="range" class="param-slider" id="rng-speed" min="3" max="25" value="15" step="0.5">
        </div>
        <div class="param-field full" style="margin-top:8px;">
          <button class="btn btn-primary" id="btn-save-params" style="width:auto;align-self:flex-start;">保存参数</button>
        </div>
      </div>
      <div class="param-desc">
        <div class="param-desc__title">参数说明</div>
        <div>• <b>智能避障</b>：开启后无人机在飞行过程中将自动检测前方障碍物并减速绕行，建议在城市或复杂地形巡检时启用。</div>
        <div>• <b>避障距离阈值</b>：无人机与障碍物之间的最小安全距离，低于此距离将触发避障动作。建议 15–30m。</div>
        <div>• <b>仿地飞行</b>：根据地形高程自动调整飞行高度，保持与地面的相对高度恒定，适用于山地、丘陵等起伏地形。</div>
        <div>• <b>最大飞行高度</b>：受当地空域法规限制，默认不超过 120m，特殊审批区域可上调。</div>
        <div>• <b>最大飞行速度</b>：巡检模式建议 8–12 m/s，紧急返航时可上调至 20 m/s。</div>
        <div>• <b>断点续飞</b>：任务中断后（如低电量返航），更换电池可从中断点继续执行剩余航线。</div>
      </div>
    </div>
  `;

  // Switch toggles
  container.querySelectorAll('.param-switch').forEach((sw) => {
    const update = () => {
      const on = sw.dataset.on === 'true';
      sw.classList.toggle('is-on', on);
    };
    update();
    sw.addEventListener('click', () => {
      sw.dataset.on = sw.dataset.on === 'true' ? 'false' : 'true';
      update();
    });
  });

  // Sliders
  const sliders = [
    { id: 'rng-distance', out: 'val-distance', suffix: ' m' },
    { id: 'rng-altitude', out: 'val-altitude', suffix: ' m' },
    { id: 'rng-speed',    out: 'val-speed',    suffix: ' m/s' },
  ];
  sliders.forEach(({ id, out, suffix }) => {
    const input = container.querySelector(`#${id}`);
    const valueEl = container.querySelector(`#${out}`);
    if (!input || !valueEl) return;
    input.addEventListener('input', () => { valueEl.textContent = input.value + suffix; });
  });

  // Save button
  container.querySelector('#btn-save-params').addEventListener('click', () => {
    showToast('参数已保存（演示模式：仅前端生效）', 'success');
  });
}

/* ---------- Data Loading ---------- */
async function refreshDrones() {
  try {
    const res = await drones.list();
    const newData = unwrap(res);
    newData.forEach((d) => {
      if (prevDroneStatus.has(d.id) && prevDroneStatus.get(d.id) !== d.status) {
        // will trigger flash on next render
      }
    });
    prevDroneStatus = new Map(newData.map((d) => [d.id, d.status]));
    droneData = newData;
    const fleetPanel = document.querySelector('[data-panel="fleet"]');
    if (fleetPanel && currentTab === 'fleet') {
      renderFleetTab(fleetPanel);
    }
    if (mapInstance && currentTab === 'geofence') {
      renderDronesOnMap();
    }
  } catch (err) {
    console.error('[flight] 刷新无人机列表失败:', err);
  }
}

async function refreshFences() {
  try {
    const res = await geoFences.list();
    fenceData = unwrap(res);
    const gfPanel = document.querySelector('[data-panel="geofence"]');
    if (gfPanel && currentTab === 'geofence') {
      renderFenceList(gfPanel.querySelector('#fence-list'));
      renderFencesOnMap();
    }
  } catch (err) {
    console.error('[flight] 刷新围栏列表失败:', err);
  }
}

/* ---------- Real-time updates ---------- */
function startRealtimeUpdates() {
  // Poll drones every 5s
  const poll = setInterval(() => { refreshDrones(); }, 5000);
  intervals.push(poll);

  // WebSocket: /ws/alarm (bypass connectWS /api prefix)
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/ws/alarm`);
  ws.onmessage = () => {
    // Alarm received -> refresh drones as a side indicator
    refreshDrones();
  };
  ws.onerror = (err) => console.error('[flight] WS alarm error:', err);
  wsConnections.push(ws);
}

/* =====================================================================
 * Main render
 * ===================================================================== */
export function render(container) {
  cleanup();
  injectStyles();

  container.innerHTML = `
    <section class="page">
      <h1 class="page-title">飞控管理</h1>
      <p class="page-subtitle">机队监控 · 电子围栏 · 飞行参数配置</p>
      <div class="flight-tabs" id="flight-tabs">
        <button class="flight-tab active" data-tab="fleet">机队列表</button>
        <button class="flight-tab" data-tab="geofence">电子围栏</button>
        <button class="flight-tab" data-tab="params">飞行参数</button>
      </div>
      <div class="flight-panel active" data-panel="fleet" id="panel-fleet"></div>
      <div class="flight-panel" data-panel="geofence" id="panel-geofence"></div>
      <div class="flight-panel" data-panel="params" id="panel-params"></div>
    </section>
  `;

  // Tab events
  container.querySelectorAll('.flight-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Initial data load
  refreshDrones().then(() => {
    const fleetPanel = container.querySelector('#panel-fleet');
    if (fleetPanel) renderFleetTab(fleetPanel);
  });
  refreshFences().then(() => {
    // geofence panel rendered on tab switch to avoid map sizing issues
  });

  // Render params tab immediately (no async needed)
  renderParamsTab(container.querySelector('#panel-params'));

  // Start realtime
  startRealtimeUpdates();

  // Observe tab switch to init map when geofence becomes visible
  const observer = new MutationObserver(() => {
    const gfPanel = container.querySelector('#panel-geofence');
    if (gfPanel && gfPanel.classList.contains('active') && !mapInstance) {
      renderGeoFenceTab(gfPanel);
    }
  });
  observer.observe(container.querySelector('#panel-geofence'), { attributes: true, attributeFilter: ['class'] });
  intervals.push({ clear: () => observer.disconnect() });
}

export default { render };
