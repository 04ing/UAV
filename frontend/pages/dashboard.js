/* =====================================================================
 * dashboard.js — 中控大屏 · Task 10
 * 指挥中心风格总览：KPI 卡片 + GIS 地图 + 实时告警 + 视频墙
 * 适配中控室大屏 1920×1080，兼容 1366×768
 * ===================================================================== */

import { drones, orders, geoFences, ai } from '/js/api.js';

/* =====================================================================
 * 模块级状态：用于页面切换时清理，避免实例残留
 * ===================================================================== */
let mapInstance = null;
let chartInstances = [];
let wsConnections = [];
let intervals = [];
let styleEl = null;
let modalEl = null;
let alarmState = [];
let alarmIdSet = new Set();

/* =====================================================================
 * 工具函数
 * ===================================================================== */

function unwrap(res, fallback = []) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.items)) return res.items;
  if (res && res.data && Array.isArray(res.data.list)) return res.data.list;
  return fallback;
}

async function loadAll() {
  const [d, o, g, m, a] = await Promise.allSettled([
    drones.list(),
    orders.list(),
    geoFences.list(),
    ai.models(),
    fetch('/api/alarms', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json())
  ]);
  
  const droneData = d.status === 'fulfilled' ? unwrap(d.value) : [];
  
  return {
    drones:    droneData,
    orders:    o.status === 'fulfilled' ? unwrap(o.value) : [],
    geoFences: g.status === 'fulfilled' ? unwrap(g.value) : [],
    aiModels:  m.status === 'fulfilled' ? unwrap(m.value) : [],
    alarms:    a.status === 'fulfilled' && a.value && a.value.data ? a.value.data : [],
    routes:    droneData.length > 0 ? [{ droneId: droneData[0].id, path: droneData.map(d => ({ lat: d.lat, lng: d.lng })) }] : []
  };
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
    case 'critical': return { color: '#ff3b6b', label: '高', cls: 'badge-danger' };
    case 'medium':
    case 'warn':     return { color: '#ff9500', label: '中', cls: 'badge-warn' };
    case 'low':
    case 'info':     return { color: '#00f5a0', label: '低', cls: 'badge-success' };
    default:         return { color: '#8a9bbd', label: sev || '未知', cls: '' };
  }
}

function statusInfo(status) {
  switch ((status || '').toLowerCase()) {
    case 'pending':    return { label: '待处理', cls: 'badge-danger' };
    case 'processing': return { label: '处理中', cls: 'badge-warn' };
    case 'review':     return { label: '复核中', cls: '' };
    case 'closed':     return { label: '已闭环', cls: 'badge-success' };
    default:           return { label: status || '--', cls: '' };
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

/** KPI 数字计数动画（从 0 缓动到目标值） */
function animateCount(el, target, opts = {}) {
  if (!el) return;
  const { duration = 1200, decimals = 0, suffix = '' } = opts;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const v = target * ease(t);
    el.textContent = (decimals ? v.toFixed(decimals) : Math.round(v).toString()) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** 直连 /ws/* WebSocket（绕过 connectWS 的 /api 前缀） */
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

/* =====================================================================
 * CSS 注入（页面作用域，离开时清理）
 * ===================================================================== */
function injectStyles() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', 'dashboard');
  styleEl.textContent = `
/* ---------- 大屏页面骨架 ---------- */
.dash-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: calc(100vh - var(--topbar-height) - var(--statusbar-height) - 40px);
}
.dash-header .page-title {
  font-size: var(--fs-2xl);
  background: linear-gradient(90deg, var(--fg-primary) 0%, var(--accent-cyan) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 2px;
  margin-bottom: 2px;
}
.dash-header .page-subtitle { color: var(--fg-secondary); font-size: var(--fs-sm); }

/* ---------- KPI 行：5 卡片 ---------- */
.dash-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1rem;
}
.dash-kpi-row .kpi-card {
  opacity: 0;
  transform: translateY(-20px);
  animation: kpiSlideIn 0.6s var(--ease-out) forwards;
  padding: 16px 20px;
}
.dash-kpi-row .kpi-card:nth-child(1) { animation-delay: 0.05s; }
.dash-kpi-row .kpi-card:nth-child(2) { animation-delay: 0.15s; }
.dash-kpi-row .kpi-card:nth-child(3) { animation-delay: 0.25s; }
.dash-kpi-row .kpi-card:nth-child(4) { animation-delay: 0.35s; }
.dash-kpi-row .kpi-card:nth-child(5) { animation-delay: 0.45s; }
@keyframes kpiSlideIn { to { opacity: 1; transform: translateY(0); } }

.kpi-card__icon {
  position: absolute;
  top: 14px;
  right: 16px;
  font-size: 20px;
  opacity: 0.55;
  filter: drop-shadow(0 0 6px var(--accent-cyan));
}
.kpi-card__value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 4px;
}
.kpi-card__value-num {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  font-weight: 700;
  color: var(--accent-cyan);
  text-shadow: 0 0 16px rgba(0, 229, 255, 0.5);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.kpi-card__value-sep {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  color: var(--fg-secondary);
  font-weight: 500;
}
.kpi-card__value-total {
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  color: var(--fg-secondary);
  font-weight: 500;
}
.kpi-card__unit {
  font-size: var(--fs-base);
  color: var(--fg-secondary);
  margin-left: 6px;
  font-weight: 400;
}

/* ---------- 中部主区：地图 + 告警 ---------- */
.dash-middle {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1rem;
  min-height: 460px;
}
.dash-map-wrap {
  position: relative;
  padding: 0;
  overflow: hidden;
  opacity: 0;
  animation: dashFadeScale 0.8s var(--ease-out) 0.5s forwards;
}
.dash-map {
  width: 100%;
  height: 100%;
  min-height: 460px;
  border-radius: var(--radius-lg);
  background: var(--bg-deep);
}
@keyframes dashFadeScale {
  from { opacity: 0; transform: scale(0.98); }
  to   { opacity: 1; transform: scale(1); }
}

/* 地图图例 */
.dash-map-legend {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 500;
  background: rgba(5, 9, 19, 0.85);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: var(--shadow-card);
  min-width: 132px;
}
.dash-map-legend__title {
  font-family: var(--font-display);
  color: var(--accent-cyan);
  font-weight: 600;
  letter-spacing: 1px;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.dash-map-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}
.dash-map-legend__swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  box-sizing: border-box;
}

/* Leaflet 深色底图覆写 */
.dash-map .leaflet-container {
  background: var(--bg-deep) !important;
  font-family: var(--font-body);
}
.dash-map .leaflet-control-attribution {
  background: rgba(5, 9, 19, 0.7) !important;
  color: var(--fg-muted) !important;
  font-size: 10px !important;
}
.dash-map .leaflet-control-attribution a { color: var(--fg-secondary) !important; }
.dash-map .leaflet-bar a {
  background: rgba(10, 18, 36, 0.9) !important;
  color: var(--accent-cyan) !important;
  border-color: var(--border-base) !important;
}
.dash-map .leaflet-bar a:hover { background: rgba(0, 229, 255, 0.15) !important; }
.dash-map .leaflet-popup-content-wrapper {
  background: rgba(10, 18, 36, 0.95);
  color: var(--fg-primary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-glow);
}
.dash-map .leaflet-popup-tip { background: rgba(10, 18, 36, 0.95); }

/* 无人机图标（自定义 divIcon + 脉冲动效） */
.drone-marker {
  position: relative;
  width: 28px;
  height: 28px;
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

/* 告警点位 */
.alarm-marker {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 12px currentColor;
}
.alarm-marker.high   { background: var(--danger);  color: var(--danger); }
.alarm-marker.medium { background: var(--warn);    color: var(--warn); }
.alarm-marker.low    { background: var(--success); color: var(--success); }

/* ---------- 告警列表 ---------- */
.dash-alarms {
  display: flex;
  flex-direction: column;
  padding: 16px;
  opacity: 0;
  animation: dashFadeScale 0.8s var(--ease-out) 0.6s forwards;
  min-height: 0;
}
.dash-alarms__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-base);
}
.dash-alarms__head h3 {
  font-family: var(--font-display);
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--fg-primary);
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dash-alarms__head h3::before {
  content: '';
  width: 4px;
  height: 16px;
  background: linear-gradient(180deg, var(--danger), var(--warn));
  border-radius: var(--radius-sm);
  box-shadow: 0 0 6px var(--danger);
}
.dash-alarms__count {
  font-family: var(--font-display);
  color: var(--danger);
  font-size: var(--fs-lg);
  font-weight: 700;
  text-shadow: 0 0 8px rgba(255, 59, 107, 0.5);
}
.dash-alarms__list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dash-alarms__empty {
  text-align: center;
  color: var(--fg-muted);
  padding: 32px 12px;
  font-size: var(--fs-sm);
}
.alarm-item {
  padding: 10px 12px;
  background: rgba(10, 18, 36, 0.5);
  border: 1px solid var(--border-base);
  border-left: 3px solid var(--fg-muted);
  border-radius: var(--radius-md);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 8px;
  font-size: var(--fs-sm);
  transition: border-color var(--duration-fast) var(--ease-out),
              background var(--duration-fast) var(--ease-out);
  cursor: pointer;
}
.alarm-item:hover {
  background: rgba(0, 229, 255, 0.05);
  border-color: var(--border-glow);
}
.alarm-item.high   { border-left-color: var(--danger); }
.alarm-item.medium { border-left-color: var(--warn); }
.alarm-item.low    { border-left-color: var(--success); }
.alarm-item.is-new { animation: alarmFlashIn 0.9s var(--ease-out); }
@keyframes alarmFlashIn {
  0%   { opacity: 0; transform: translateX(24px); background: rgba(255, 59, 107, 0.3); }
  50%  { background: rgba(255, 59, 107, 0.15); }
  100% { opacity: 1; transform: translateX(0); background: rgba(10, 18, 36, 0.5); }
}
.alarm-item__type {
  color: var(--fg-primary);
  font-weight: 600;
  font-size: var(--fs-sm);
}
.alarm-item__time {
  color: var(--fg-secondary);
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.alarm-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-muted);
  font-size: var(--fs-xs);
}
.alarm-item__row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}
.alarm-item__loc {
  color: var(--fg-secondary);
  font-size: var(--fs-xs);
  font-family: var(--font-display);
}
.alarm-item .badge {
  font-size: 10px;
  padding: 1px 8px;
}

/* ---------- 视频墙 ---------- */
.dash-video-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  opacity: 0;
  animation: dashFadeScale 0.8s var(--ease-out) 0.7s forwards;
}
.dash-video-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}
.video-tile {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--bg-deep);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}
.video-tile:hover {
  border-color: var(--border-glow);
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}
.video-tile__frame {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 30% 40%, rgba(0,229,255,0.10), transparent 50%),
    radial-gradient(circle at 70% 60%, rgba(0,102,255,0.10), transparent 50%),
    linear-gradient(135deg, #0a1224 0%, #050913 100%);
}
.video-tile__noise {
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 2px),
    repeating-linear-gradient(90deg, rgba(0,229,255,0.02) 0, rgba(0,229,255,0.02) 1px, transparent 1px, transparent 3px);
  mix-blend-mode: screen;
  animation: noiseShift 0.5s steps(4) infinite;
  opacity: 0.55;
  pointer-events: none;
}
@keyframes noiseShift {
  0%   { transform: translate(0,0); }
  25%  { transform: translate(-1px,1px); }
  50%  { transform: translate(1px,-1px); }
  75%  { transform: translate(-1px,-1px); }
  100% { transform: translate(1px,1px); }
}
.video-tile__scan {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(0,229,255,0.08) 50%, transparent 100%);
  background-size: 100% 200%;
  animation: scanLine 3s linear infinite;
  pointer-events: none;
}
@keyframes scanLine {
  0%   { background-position: 0 -100%; }
  100% { background-position: 0 200%; }
}
.video-tile__name {
  position: absolute;
  top: 8px;
  left: 10px;
  z-index: 2;
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  color: var(--fg-primary);
  letter-spacing: 0.5px;
  text-shadow: 0 0 4px rgba(0,0,0,0.85);
  background: rgba(5,9,19,0.6);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-base);
}
.video-tile__hud {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
  font-family: var(--font-display);
  color: var(--fg-primary);
  background: rgba(5,9,19,0.6);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-base);
}
.video-tile__live {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--danger);
  font-weight: 700;
  letter-spacing: 1px;
}
.video-tile__live::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 6px var(--danger);
  animation: liveBlink 1s steps(2) infinite;
}
@keyframes liveBlink {
  0%, 50%   { opacity: 1; }
  51%, 100% { opacity: 0.2; }
}
.video-tile__ts {
  color: var(--fg-secondary);
  font-variant-numeric: tabular-nums;
}
.video-tile__hud-bottom {
  position: absolute;
  bottom: 8px;
  left: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
  font-family: var(--font-display);
  text-shadow: 0 0 4px rgba(0,0,0,0.85);
}
.video-tile__status { display: flex; align-items: center; gap: 5px; }
.video-tile.is-offline .video-tile__frame { filter: grayscale(0.8) brightness(0.5); }
.video-tile.is-offline .video-tile__noise,
.video-tile.is-offline .video-tile__scan  { animation: none; opacity: 0.2; }
.video-tile.is-offline .video-tile__live  { color: var(--fg-muted); }
.video-tile.is-offline .video-tile__live::before { background: var(--fg-muted); animation: none; box-shadow: none; }

/* ---------- 视频放大 Modal ---------- */
.video-modal {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
}
.video-modal[hidden] { display: none; }
.video-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5, 9, 19, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 0.3s var(--ease-out);
}
.video-modal__content {
  position: relative;
  width: min(80vw, 1280px);
  background: var(--bg-elev);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glow), 0 16px 64px rgba(0,0,0,0.6);
  overflow: hidden;
  animation: modalIn 0.4s var(--ease-out);
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
.video-modal__close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(5,9,19,0.7);
  color: var(--fg-primary);
  font-size: 20px;
  border: 1px solid var(--border-base);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}
.video-modal__close:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
  transform: rotate(90deg);
}
.video-modal__title {
  padding: 14px 20px;
  font-family: var(--font-display);
  color: var(--accent-cyan);
  font-size: var(--fs-lg);
  letter-spacing: 1px;
  border-bottom: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  gap: 8px;
}
.video-modal__title::before {
  content: '🎥';
  filter: drop-shadow(0 0 6px var(--accent-cyan));
}
.video-modal__frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--bg-deep);
  overflow: hidden;
}
.video-modal__frame .video-tile__name,
.video-modal__frame .video-tile__hud,
.video-modal__frame .video-tile__hud-bottom { font-size: var(--fs-sm); }

/* ---------- 响应式：1366×768 可用 ---------- */
@media (max-width: 1440px) {
  .dash-kpi-row { gap: 0.75rem; }
  .kpi-card { padding: 14px 16px; }
  .kpi-card__value-num { font-size: var(--fs-2xl); }
  .kpi-card__icon { font-size: 18px; }
  .dash-middle { min-height: 380px; }
  .dash-map { min-height: 380px; }
}
@media (max-width: 1280px) {
  .dash-kpi-row { grid-template-columns: repeat(3, 1fr); }
  .dash-kpi-row .kpi-card:nth-child(4) { animation-delay: 0.35s; }
  .dash-kpi-row .kpi-card:nth-child(5) { animation-delay: 0.45s; }
  .dash-video-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .video-tile__noise, .video-tile__scan, .drone-marker__pulse,
  .video-tile__live::before { animation: none !important; }
}
  `;
  document.head.appendChild(styleEl);
}

/* =====================================================================
 * 地图初始化（Leaflet + CartoDB DarkMatter）
 * ===================================================================== */
function initMap(droneList, alarmList, geoFenceList, routes) {
  if (mapInstance) {
    try { mapInstance.remove(); } catch (_) {}
    mapInstance = null;
  }
  const mapEl = document.getElementById('dash-map');
  if (!mapEl || !window.L) {
    console.warn('[dashboard] Leaflet 未加载或地图容器缺失');
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

  // 电子围栏多边形（高亮边界）
  geoFenceList.forEach((gf) => {
    if (!gf.polygon || !gf.polygon.length) return;
    const latlngs = gf.polygon.map((p) => [p.lat, p.lng]);
    const color = gf.type === 'no-fly' ? '#ff3b6b' : '#ff9500';
    window.L.polygon(latlngs, {
      color,
      weight: 2,
      opacity: 0.85,
      fillColor: color,
      fillOpacity: 0.08,
      dashArray: '6 3'
    }).addTo(mapInstance).bindPopup(
      `<b>${gf.name}</b><br>类型: ${gf.type === 'no-fly' ? '禁飞区' : '限制区'}`
    );
  });

  // 航线轨迹（虚线）
  routes.forEach((route) => {
    if (!Array.isArray(route) || !route.length) return;
    const latlngs = route.map((p) => (Array.isArray(p) ? p : [p.lat, p.lng]));
    window.L.polyline(latlngs, {
      color: '#00e5ff',
      weight: 1.5,
      opacity: 0.55,
      dashArray: '6 4'
    }).addTo(mapInstance);
  });

  // 告警点位（按 severity 不同颜色）
  alarmList.forEach((alarm) => {
    if (alarm.lat == null || alarm.lng == null) return;
    const sev = (alarm.severity || '').toLowerCase();
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="alarm-marker ${sev}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    window.L.marker([alarm.lat, alarm.lng], { icon })
      .addTo(mapInstance)
      .bindPopup(
        `<b>${alarm.type || '告警'}</b>` +
        `<br>级别: ${severityInfo(alarm.severity).label}` +
        `<br>无人机: ${alarm.droneId || '--'}` +
        `<br>时间: ${fmtDateTime(alarm.timestamp)}`
      );
  });

  // 无人机实时位置标记（含脉冲动效）
  droneList.forEach((drone) => {
    if (drone.lat == null || drone.lng == null) return;
    const status = (drone.status || '').toLowerCase();
    const info = droneStatusInfo(drone.status);
    const num = (drone.id || '').replace('DRONE-', '');
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="drone-marker is-${status}">
        <div class="drone-marker__pulse"></div>
        <div class="drone-marker__core">${num}</div>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    window.L.marker([drone.lat, drone.lng], { icon, zIndexOffset: 1000 })
      .addTo(mapInstance)
      .bindPopup(
        `<b>${drone.id}</b>` +
        `<br>型号: ${drone.model || '--'}` +
        `<br>状态: ${info.label}` +
        `<br>电量: ${drone.battery ?? '--'}%` +
        `<br>信号: ${drone.signal || '--'}`
      );
  });

  // 自动适配视野
  if (droneList.length) {
    try {
      const bounds = window.L.latLngBounds(
        droneList.map((d) => [d.lat, d.lng])
      );
      mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } catch (_) { /* ignore */ }
  }

  // 延迟修正尺寸（容器刚挂载时可能未就绪）
  setTimeout(() => {
    if (mapInstance) {
      try { mapInstance.invalidateSize(); } catch (_) {}
    }
  }, 200);
}

/* =====================================================================
 * 告警列表
 * ===================================================================== */
function renderAlarmList(container, alarms, isNewTop = false) {
  if (!container) return;
  if (!alarms.length) {
    container.innerHTML = '<div class="dash-alarms__empty">暂无告警</div>';
    return;
  }
  container.innerHTML = alarms
    .map((a, i) => {
      const sev = (a.severity || '').toLowerCase();
      const sevInfo = severityInfo(a.severity);
      const stInfo = statusInfo(a.status);
      const lat = a.lat != null ? Number(a.lat).toFixed(4) : '--';
      const lng = a.lng != null ? Number(a.lng).toFixed(4) : '--';
      return `
        <div class="alarm-item ${sev} ${isNewTop && i === 0 ? 'is-new' : ''}" data-id="${a.id}">
          <div class="alarm-item__type">${a.type || '未知告警'}</div>
          <div class="alarm-item__time">${fmtTime(a.timestamp)}</div>
          <div class="alarm-item__meta">
            <span class="badge ${sevInfo.cls}">${sevInfo.label}</span>
            <span>${a.droneId || '--'}</span>
          </div>
          <div class="alarm-item__row">
            <span class="alarm-item__loc">📍 ${lat}, ${lng}</span>
            <span class="badge ${stInfo.cls}">${stInfo.label}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function prependAlarm(container, alarm) {
  alarmState.unshift(alarm);
  if (alarmState.length > 50) alarmState = alarmState.slice(0, 50);
  renderAlarmList(container, alarmState, true);
  const countEl = document.getElementById('alarm-count');
  if (countEl) countEl.textContent = String(alarmState.length);
}

/* =====================================================================
 * 视频墙
 * ===================================================================== */
function initVideoWall(droneList) {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  // 优先选择在线无人机，凑足 4 路
  const online = droneList.filter((d) => d.status !== 'offline');
  const pick = online.length >= 4 ? online.slice(0, 4) : droneList.slice(0, 4);

  grid.innerHTML = pick
    .map((d) => {
      const info = droneStatusInfo(d.status);
      const isOffline = d.status === 'offline';
      return `
        <div class="video-tile ${isOffline ? 'is-offline' : ''}" data-drone-id="${d.id}" tabindex="0" role="button" aria-label="放大 ${d.id} 视频画面">
          <div class="video-tile__frame"></div>
          <div class="video-tile__noise"></div>
          <div class="video-tile__scan"></div>
          <div class="video-tile__name">${d.id} · ${d.model || ''}</div>
          <div class="video-tile__hud">
            <span class="video-tile__live">${isOffline ? 'OFFLINE' : 'LIVE'}</span>
            <span class="video-tile__ts" data-ts>${isOffline ? '--:--:--' : fmtTime(Date.now())}</span>
          </div>
          <div class="video-tile__hud-bottom">
            <span class="video-tile__status">
              <span class="status-dot ${info.dot}"></span>${info.label}
            </span>
            <span>🔋 ${d.battery ?? '--'}%</span>
          </div>
        </div>
      `;
    })
    .join('');

  // 点击 / 回车放大
  grid.querySelectorAll('.video-tile').forEach((tile) => {
    const open = () => openVideoModal(tile);
    tile.addEventListener('click', open);
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function openVideoModal(tile) {
  if (modalEl) modalEl.remove();
  const droneId = tile.dataset.droneId;
  const nameEl = tile.querySelector('.video-tile__name');
  const name = nameEl ? nameEl.textContent : droneId;
  const isOffline = tile.classList.contains('is-offline');
  const statusHtml = tile.querySelector('.video-tile__hud-bottom')
    ? tile.querySelector('.video-tile__hud-bottom').innerHTML
    : '';

  modalEl = document.createElement('div');
  modalEl.className = 'video-modal';
  modalEl.innerHTML = `
    <div class="video-modal__backdrop"></div>
    <div class="video-modal__content">
      <button class="video-modal__close" aria-label="关闭">×</button>
      <div class="video-modal__title">${name}</div>
      <div class="video-modal__frame">
        <div class="video-tile__frame"></div>
        <div class="video-tile__noise"></div>
        <div class="video-tile__scan"></div>
        <div class="video-tile__hud">
          <span class="video-tile__live">${isOffline ? 'OFFLINE' : 'LIVE'}</span>
          <span class="video-tile__ts" data-ts>${isOffline ? '--:--:--' : fmtTime(Date.now())}</span>
        </div>
        <div class="video-tile__hud-bottom">${statusHtml}</div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  const close = () => {
    if (modalEl) { modalEl.remove(); modalEl = null; }
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  modalEl.querySelector('.video-modal__close').addEventListener('click', close);
  modalEl.querySelector('.video-modal__backdrop').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  // 同步时间戳到 modal
  if (!isOffline) {
    const tsEl = modalEl.querySelector('[data-ts]');
    const modalTsTimer = setInterval(() => {
      if (!modalEl) return;
      if (tsEl) tsEl.textContent = fmtTime(Date.now());
    }, 1000);
    // 关闭时清掉（通过 cleanup 兜底；这里也在 close 中处理）
    const origClose = close;
    const newClose = () => { clearInterval(modalTsTimer); origClose(); };
    modalEl.querySelector('.video-modal__close').removeEventListener('click', close);
    modalEl.querySelector('.video-modal__close').addEventListener('click', newClose);
    modalEl.querySelector('.video-modal__backdrop').removeEventListener('click', close);
    modalEl.querySelector('.video-modal__backdrop').addEventListener('click', newClose);
  }
}

/* =====================================================================
 * WebSocket 实时数据
 * ===================================================================== */
function setupWebSockets() {
  // /ws/alarm —— 收到新告警时插入顶部
  const wsAlarm = openWS('/ws/alarm', (msg) => {
    const alarm = msg && msg.data ? msg.data : msg;
    if (!alarm || !alarm.type) return;
    // 服务端从固定 10 条中随机推送；为呈现"实时流入"，每条都视作新事件
    const newAlarm = {
      ...alarm,
      id: `${alarm.id}-${Date.now()}`,
      timestamp: (msg && msg.timestamp) || Date.now()
    };
    alarmIdSet.add(newAlarm.id);
    prependAlarm(document.getElementById('alarm-list'), newAlarm);
  });
  wsConnections.push(wsAlarm);

  // /ws/video —— 收到数据时更新对应视频窗口的状态指示
  let rrIdx = 0;
  const wsVideo = openWS('/ws/video', (msg) => {
    if (!msg) return;
    const droneId = msg.droneId || 'DRONE-001';
    const ts = msg.timestamp || Date.now();
    const tsStr = fmtTime(ts);
    // 优先匹配 droneId 对应窗口
    const tile = document.querySelector(`.video-tile[data-drone-id="${droneId}"] [data-ts]`);
    if (tile) {
      tile.textContent = tsStr;
    } else {
      // 没有匹配则轮询更新其他在线窗口（模拟多路图传）
      const tiles = document.querySelectorAll('.video-tile:not(.is-offline) [data-ts]');
      if (tiles.length) {
        tiles[rrIdx % tiles.length].textContent = tsStr;
        rrIdx++;
      }
    }
    // 同步放大 modal 中的时间戳
    if (modalEl) {
      const m = modalEl.querySelector('[data-ts]');
      if (m) m.textContent = tsStr;
    }
  });
  wsConnections.push(wsVideo);

  // 本地秒级时钟：保证所有 LIVE 窗口时间戳持续走动
  const tsTimer = setInterval(() => {
    document.querySelectorAll('.video-tile:not(.is-offline) [data-ts]').forEach((el) => {
      el.textContent = fmtTime(Date.now());
    });
  }, 1000);
  intervals.push(tsTimer);
}

/* =====================================================================
 * 清理：每次 render 开头调用，避免实例残留
 * ===================================================================== */
function cleanup() {
  // 关闭 WebSocket
  wsConnections.forEach((ws) => {
    try {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    } catch (_) {}
  });
  wsConnections = [];

  // 销毁 Leaflet 实例
  if (mapInstance) {
    try { mapInstance.remove(); } catch (_) {}
    mapInstance = null;
  }

  // 销毁 ECharts 实例（预留，当前页面未使用）
  chartInstances.forEach((c) => {
    try { if (c) c.dispose(); } catch (_) {}
  });
  chartInstances = [];

  // 清理定时器
  intervals.forEach((id) => clearInterval(id));
  intervals = [];

  // 移除注入的样式
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }

  // 移除放大 Modal
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }

  // 重置状态
  alarmState = [];
  alarmIdSet = new Set();
}

/* =====================================================================
 * render —— 主入口
 * ===================================================================== */
export function render(container) {
  // 进入前先清理上一轮残留（页面切换回来时尤为重要）
  cleanup();

  // 注入页面作用域样式
  injectStyles();

  // 渲染骨架（KPI 占位 "--"，等数据到达后做计数动画）
  container.innerHTML = `
    <section class="page dash-page">
      <header class="dash-header">
        <h1 class="page-title">中控大屏</h1>
        <p class="page-subtitle">无人机集群实时监控 · KPI 总览 · 告警事件 · 视频墙</p>
      </header>

      <!-- ============ 顶部 KPI 卡片区 ============ -->
      <div class="dash-kpi-row">
        <div class="kpi-card">
          <div class="kpi-card__icon">🚁</div>
          <div class="kpi-card__label">在线无人机</div>
          <div class="kpi-card__value-row">
            <span class="kpi-card__value-num" id="kpi-online">--</span>
            <span class="kpi-card__value-sep">/</span>
            <span class="kpi-card__value-total" id="kpi-total">--</span>
          </div>
          <div class="kpi-card__delta">实时在线 / 总数</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon">⚠️</div>
          <div class="kpi-card__label">今日告警</div>
          <div class="kpi-card__value-row">
            <span class="kpi-card__value-num" id="kpi-alarms">--</span>
            <span class="kpi-card__unit">起</span>
          </div>
          <div class="kpi-card__delta">较昨日 +3</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon">📋</div>
          <div class="kpi-card__label">待处理工单</div>
          <div class="kpi-card__value-row">
            <span class="kpi-card__value-num" id="kpi-orders">--</span>
            <span class="kpi-card__unit">单</span>
          </div>
          <div class="kpi-card__delta">需立即处置</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon">🎯</div>
          <div class="kpi-card__label">AI 识别准确率</div>
          <div class="kpi-card__value-row">
            <span class="kpi-card__value-num" id="kpi-accuracy">--</span>
            <span class="kpi-card__unit">%</span>
          </div>
          <div class="kpi-card__delta">综合识别精度</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__icon">📏</div>
          <div class="kpi-card__label">今日巡检里程</div>
          <div class="kpi-card__value-row">
            <span class="kpi-card__value-num" id="kpi-mileage">--</span>
            <span class="kpi-card__unit">km</span>
          </div>
          <div class="kpi-card__delta">累计巡检距离</div>
        </div>
      </div>

      <!-- ============ 中部主区：地图 + 告警 ============ -->
      <div class="dash-middle">
        <div class="dash-map-wrap card">
          <div class="dash-map" id="dash-map"></div>
          <div class="dash-map-legend" aria-hidden="true">
            <div class="dash-map-legend__title">图例</div>
            <div class="dash-map-legend__item">
              <span class="dash-map-legend__swatch" style="background:#00f5a0;box-shadow:0 0 6px #00f5a0;"></span>在线无人机
            </div>
            <div class="dash-map-legend__item">
              <span class="dash-map-legend__swatch" style="background:#ff9500;box-shadow:0 0 6px #ff9500;"></span>返航中
            </div>
            <div class="dash-map-legend__item">
              <span class="dash-map-legend__swatch" style="background:#ff3b6b;box-shadow:0 0 6px #ff3b6b;"></span>高危告警
            </div>
            <div class="dash-map-legend__item">
              <span class="dash-map-legend__swatch" style="background:#ff9500;"></span>中危告警
            </div>
            <div class="dash-map-legend__item">
              <span class="dash-map-legend__swatch" style="background:#00f5a0;"></span>低危告警
            </div>
            <div class="dash-map-legend__item">
              <span class="dash-map-legend__swatch" style="background:transparent;border:1px dashed #00e5ff;"></span>巡检航线
            </div>
            <div class="dash-map-legend__item">
              <span class="dash-map-legend__swatch" style="background:transparent;border:1px dashed #ff9500;"></span>电子围栏
            </div>
          </div>
        </div>

        <div class="dash-alarms card">
          <div class="dash-alarms__head">
            <h3>实时告警</h3>
            <span class="dash-alarms__count" id="alarm-count">0</span>
          </div>
          <div class="dash-alarms__list" id="alarm-list">
            <div class="dash-alarms__empty">加载中...</div>
          </div>
        </div>
      </div>

      <!-- ============ 底部视频墙 ============ -->
      <div class="dash-video-section">
        <h3 class="section-title">视频墙 · 实时图传</h3>
        <div class="dash-video-grid" id="video-grid"></div>
      </div>
    </section>
  `;

  /* ---------- 异步加载数据 → 渲染各模块 ---------- */
  loadAll().then((data) => {
    // KPI 计算
    const onlineDrones = data.drones.filter((d) => d.status !== 'offline').length;
    const totalDrones = data.drones.length;
    const todayAlarms = data.alarms.length;
    const pendingOrders = data.orders.filter((o) => o.status === 'pending').length;
    const avgAccuracy = data.aiModels.length
      ? data.aiModels.reduce((s, m) => s + (m.accuracy || 0), 0) / data.aiModels.length
      : 0;
    const mileage = data.orders.filter(o => o.status === 'closed').length * 5.2; // 基于已完成工单数估算

    // KPI 计数动画（从 0 缓动到目标值）
    animateCount(document.getElementById('kpi-online'),   onlineDrones,   { duration: 1200 });
    animateCount(document.getElementById('kpi-total'),    totalDrones,    { duration: 1400 });
    animateCount(document.getElementById('kpi-alarms'),   todayAlarms,    { duration: 1300 });
    animateCount(document.getElementById('kpi-orders'),   pendingOrders,  { duration: 1100 });
    animateCount(document.getElementById('kpi-accuracy'), avgAccuracy,    { duration: 1500, decimals: 1 });
    animateCount(document.getElementById('kpi-mileage'),  mileage,        { duration: 1600, decimals: 1 });

    // 初始化地图
    initMap(data.drones, data.alarms, data.geoFences, data.routes);

    // 初始化告警列表（按时间倒序，最新在顶部）
    alarmState = [...data.alarms].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    alarmState.forEach((a) => alarmIdSet.add(a.id));
    renderAlarmList(document.getElementById('alarm-list'), alarmState);
    const countEl = document.getElementById('alarm-count');
    if (countEl) countEl.textContent = String(alarmState.length);

    // 初始化视频墙
    initVideoWall(data.drones);

    // 启动 WebSocket
    setupWebSockets();
  }).catch((err) => {
    console.error('[dashboard] 数据加载失败:', err);
    const list = document.getElementById('alarm-list');
    if (list) list.innerHTML = '<div class="dash-alarms__empty">数据加载失败，请检查后端</div>';
  });
}

export default { render };
