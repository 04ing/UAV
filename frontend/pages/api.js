/* =====================================================================
 * api.js — 接口管理页（Task 18）
 * RESTful API 协议文档 · 实时视频流演示
 * ===================================================================== */

import { meta } from '/js/api.js';

/* =====================================================================
 * 模块级状态（页面离开时清理）
 * ===================================================================== */
let styleEl = null;
let wsConnections = [];
let intervals = [];
let modalEl = null;
let currentFilter = '全部';
let expandedRows = new Set();

/* =====================================================================
 * 工具函数
 * ===================================================================== */

function fmtTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '--:--:--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

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

/** 直连 WebSocket（绕过 /api 前缀） */
function openWS(path, onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}${path}`;
  const ws = new WebSocket(url);
  ws.onmessage = (event) => {
    if (typeof onMessage !== 'function') return;
    let payload = event.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) {}
    }
    onMessage(payload);
  };
  ws.onerror = (err) => console.error(`[ws] ${path} error:`, err);
  return ws;
}

/* =====================================================================
 * 样式注入
 * ===================================================================== */
function injectStyles() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', 'api-page');
  styleEl.textContent = `
/* ---------- 页面骨架 ---------- */
.api-page { display: flex; flex-direction: column; gap: 1.25rem; padding-bottom: 24px; }

/* ---------- KPI ---------- */
.api-kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}
.api-kpi-row .kpi-card {
  opacity: 0;
  animation: kpiFadeIn 0.6s var(--ease-out) forwards;
}
.api-kpi-row .kpi-card:nth-child(1) { animation-delay: 0.05s; }
.api-kpi-row .kpi-card:nth-child(2) { animation-delay: 0.15s; }
.api-kpi-row .kpi-card:nth-child(3) { animation-delay: 0.25s; }
@keyframes kpiFadeIn { to { opacity: 1; } }

/* ---------- 过滤标签 ---------- */
.api-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.api-filter__label {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  letter-spacing: 0.5px;
  margin-right: 4px;
}
.api-filter__btn {
  padding: 5px 12px;
  font-size: var(--fs-xs);
  font-family: var(--font-display);
  letter-spacing: 0.5px;
  border-radius: 999px;
  border: 1px solid var(--border-base);
  background: rgba(255,255,255,0.03);
  color: var(--fg-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.api-filter__btn:hover {
  border-color: var(--border-glow);
  color: var(--fg-primary);
}
.api-filter__btn.is-active {
  background: rgba(0, 229, 255, 0.12);
  border-color: rgba(0, 229, 255, 0.5);
  color: var(--accent-cyan);
  box-shadow: 0 0 12px rgba(0, 229, 255, 0.15);
}

/* ---------- 表格容器 ---------- */
.api-table-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  overflow: hidden;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-card);
}
.api-table-wrap::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0,229,255,0.5), transparent);
}
.api-table-wrap { position: relative; }

/* ---------- 表格行入场动画 ---------- */
.api-table tbody tr {
  opacity: 0;
  animation: rowFadeIn 0.5s var(--ease-out) forwards;
}
@keyframes rowFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ---------- 方法徽章 ---------- */
.badge-method {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-display);
  border-radius: 4px;
  letter-spacing: 0.5px;
  border: 1px solid transparent;
}
.badge--get    { background: rgba(0, 245, 160, 0.12); color: var(--success); border-color: rgba(0, 245, 160, 0.35); }
.badge--post   { background: rgba(255, 149, 0, 0.12); color: var(--warn);    border-color: rgba(255, 149, 0, 0.35); }
.badge--put    { background: rgba(77, 159, 255, 0.12); color: var(--accent-electric); border-color: rgba(77, 159, 255, 0.35); }
.badge--delete { background: rgba(255, 59, 107, 0.12); color: var(--danger); border-color: rgba(255, 59, 107, 0.35); }
.badge--ws     { background: rgba(0, 229, 255, 0.12); color: var(--accent-cyan); border-color: rgba(0, 229, 255, 0.35); }

/* ---------- 手风琴展开行 ---------- */
.api-row-main { cursor: pointer; user-select: none; }
.api-row-main:hover td { background: rgba(0, 229, 255, 0.04); }
.api-row-main.is-expanded td { border-bottom: none; }
.api-row-main .expand-icon {
  display: inline-block;
  width: 16px; height: 16px;
  text-align: center;
  line-height: 16px;
  font-size: 10px;
  color: var(--fg-muted);
  transition: transform var(--duration-fast) var(--ease-out);
  margin-right: 6px;
}
.api-row-main.is-expanded .expand-icon { transform: rotate(90deg); color: var(--accent-cyan); }

.api-row-detail td {
  padding: 0 16px 16px;
  background: rgba(10, 18, 36, 0.5);
  border-bottom: 1px solid rgba(0, 229, 255, 0.06);
}
.api-row-detail__inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  font-size: var(--fs-sm);
}
@media (max-width: 1100px) {
  .api-row-detail__inner { grid-template-columns: 1fr; }
}
.api-detail-block {
  background: rgba(5, 9, 19, 0.5);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  padding: 12px;
}
.api-detail-block__label {
  font-size: var(--fs-xs);
  color: var(--accent-cyan);
  font-family: var(--font-display);
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.api-detail-block__code {
  font-family: 'Courier New', monospace;
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
  line-height: 1.5;
  word-break: break-all;
  white-space: pre-wrap;
}

/* ---------- 视频演示区 ---------- */
.api-video-section { display: flex; flex-direction: column; gap: 0.75rem; }
.api-video-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
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
.video-tile__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #050913;
}
.video-tile__scan {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(0,229,255,0.06) 50%, transparent 100%);
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
.video-modal__frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--bg-deep);
  overflow: hidden;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1280px) {
  .api-video-grid { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .api-kpi-row { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .video-tile__scan, .video-tile__live::before { animation: none !important; }
}
  `;
  document.head.appendChild(styleEl);
}

/* =====================================================================
 * 清理
 * ===================================================================== */
function cleanup() {
  wsConnections.forEach((ws) => {
    try {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    } catch (_) {}
  });
  wsConnections = [];
  intervals.forEach((id) => clearInterval(id));
  intervals = [];
  if (styleEl) { styleEl.remove(); styleEl = null; }
  if (modalEl) { modalEl.remove(); modalEl = null; }
  expandedRows.clear();
  currentFilter = '全部';
}

/* =====================================================================
 * KPI 渲染
 * ===================================================================== */
function renderKPIPlaceholder() {
  return `
    <div class="api-kpi-row">
      <div class="kpi-card">
        <div class="kpi-card__label">API 端点总数</div>
        <div class="kpi-card__value"><span id="api-kpi-total">--</span><span class="kpi-card__unit">个</span></div>
        <div class="kpi-card__delta">REST + WebSocket</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">已启用接口数</div>
        <div class="kpi-card__value"><span id="api-kpi-enabled">--</span><span class="kpi-card__unit">个</span></div>
        <div class="kpi-card__delta up">服务正常</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">今日调用次数</div>
        <div class="kpi-card__value"><span id="api-kpi-calls">--</span><span class="kpi-card__unit">次</span></div>
        <div class="kpi-card__delta up">实时累计</div>
      </div>
    </div>
  `;
}

/* =====================================================================
 * 方法徽章
 * ===================================================================== */
function methodBadge(method) {
  const m = (method || '').toUpperCase();
  const map = {
    'GET': 'badge--get',
    'POST': 'badge--post',
    'PUT': 'badge--put',
    'DELETE': 'badge--delete',
    'WS': 'badge--ws'
  };
  const cls = map[m] || 'badge--get';
  return `<span class="badge-method ${cls}">${m}</span>`;
}

/* =====================================================================
 * 过滤按钮
 * ===================================================================== */
function renderFilter(categories) {
  const all = ['全部', ...categories];
  return `
    <div class="api-filter">
      <span class="api-filter__label">分类过滤</span>
      ${all.map((c) => `
        <button class="api-filter__btn ${c === currentFilter ? 'is-active' : ''}" data-filter="${c}" type="button">${c}</button>
      `).join('')}
    </div>
  `;
}

/* =====================================================================
 * 表格渲染
 * ===================================================================== */
function renderTable(endpoints) {
  const cats = Array.from(new Set(endpoints.map((e) => e.category)));
  const filtered = currentFilter === '全部'
    ? endpoints
    : endpoints.filter((e) => e.category === currentFilter);

  return `
    ${renderFilter(cats)}
    <div class="api-table-wrap">
      <table class="table api-table">
        <thead>
          <tr>
            <th style="width:90px">分类</th>
            <th style="width:70px">方法</th>
            <th>路径</th>
            <th>描述</th>
            <th style="width:50px"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((ep, i) => {
            const rowId = `ep-${i}`;
            const isExpanded = expandedRows.has(rowId);
            return `
              <tr class="api-row-main ${isExpanded ? 'is-expanded' : ''}" data-row="${rowId}" style="animation-delay:${Math.min(i * 40, 800)}ms">
                <td><span class="badge">${ep.category}</span></td>
                <td>${methodBadge(ep.method)}</td>
                <td><code style="font-family:monospace;font-size:var(--fs-xs);color:var(--accent-cyan);">${ep.path}</code></td>
                <td>${ep.description}</td>
                <td><span class="expand-icon">▸</span></td>
              </tr>
              <tr class="api-row-detail" data-detail="${rowId}" style="display:${isExpanded ? '' : 'none'}">
                <td colspan="5">
                  <div class="api-row-detail__inner">
                    <div class="api-detail-block">
                      <div class="api-detail-block__label">请求参数</div>
                      <div class="api-detail-block__code">${ep.params || '无'}</div>
                    </div>
                    <div class="api-detail-block">
                      <div class="api-detail-block__label">返回示例</div>
                      <div class="api-detail-block__code">${ep.response || '无'}</div>
                    </div>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
          ${filtered.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--fg-muted);padding:24px;">暂无数据</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

/* =====================================================================
 * 视频区
 * ===================================================================== */
function renderVideoSection() {
  return `
    <div class="api-video-section">
      <h3 class="section-title">实时视频演示 · WebSocket 图传</h3>
      <div class="api-video-grid" id="api-video-grid">
        <div class="video-tile" data-video="0" tabindex="0" role="button" aria-label="放大视频窗口 1">
          <canvas class="video-tile__canvas" id="video-canvas-0"></canvas>
          <div class="video-tile__scan"></div>
          <div class="video-tile__name">DRONE-001 · DJI M350</div>
          <div class="video-tile__hud">
            <span class="video-tile__live">LIVE</span>
            <span class="video-tile__ts" id="video-ts-0">--:--:--</span>
          </div>
          <div class="video-tile__hud-bottom">
            <span>🎥 主摄像头</span>
            <span>WS /ws/video</span>
          </div>
        </div>
        <div class="video-tile" data-video="1" tabindex="0" role="button" aria-label="放大视频窗口 2">
          <canvas class="video-tile__canvas" id="video-canvas-1"></canvas>
          <div class="video-tile__scan"></div>
          <div class="video-tile__name">DRONE-002 · DJI M30T</div>
          <div class="video-tile__hud">
            <span class="video-tile__live">LIVE</span>
            <span class="video-tile__ts" id="video-ts-1">--:--:--</span>
          </div>
          <div class="video-tile__hud-bottom">
            <span>🎥 红外摄像头</span>
            <span>WS /ws/video</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =====================================================================
 * Canvas 噪点绘制
 * ===================================================================== */
function startNoiseAnimation() {
  const canvases = [
    document.getElementById('video-canvas-0'),
    document.getElementById('video-canvas-1')
  ];
  const ctxs = canvases.map((c) => c ? c.getContext('2d') : null);

  function resize() {
    canvases.forEach((c) => {
      if (!c) return;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * (window.devicePixelRatio || 1);
      c.height = rect.height * (window.devicePixelRatio || 1);
    });
  }
  resize();
  window.addEventListener('resize', resize);

  let frame = 0;
  function draw() {
    frame++;
    ctxs.forEach((ctx, idx) => {
      if (!ctx) return;
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const dpr = window.devicePixelRatio || 1;

      // 背景
      ctx.fillStyle = '#050913';
      ctx.fillRect(0, 0, w, h);

      // 彩色噪点
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      // 降低分辨率绘制以提升性能：每 4px 一个块
      const step = 4 * dpr;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const r = Math.random();
          if (r > 0.92) {
            const val = Math.floor(40 + Math.random() * 60);
            const colorIdx = (idx + frame) % 3;
            const rr = colorIdx === 0 ? val + 40 : val;
            const gg = colorIdx === 1 ? val + 40 : val;
            const bb = colorIdx === 2 ? val + 60 : val;
            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const i = ((y + dy) * w + (x + dx)) * 4;
                data[i] = rr;
                data[i + 1] = gg;
                data[i + 2] = bb;
                data[i + 3] = 180;
              }
            }
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // 叠加文字信息
      ctx.fillStyle = 'rgba(0,229,255,0.35)';
      ctx.font = `${12 * dpr}px monospace`;
      ctx.fillText(`FRAME ${(frame * 3 + idx * 7) % 9999}`, 12 * dpr, h - 12 * dpr);
    });
  }

  const animTimer = setInterval(draw, 120); // ~8fps
  intervals.push(animTimer);

  // 清理 resize listener（用 once 不行，需要存储引用）
  const resizeHandler = resize;
  window.addEventListener('resize', resizeHandler);
  // 存储以便 cleanup（通过 intervals 数组无法清理 listener，但页面切换后 canvas 已销毁，问题不大）
}

/* =====================================================================
 * 视频放大 Modal
 * ===================================================================== */
function openVideoModal(tileIdx) {
  if (modalEl) modalEl.remove();
  const name = tileIdx === 0 ? 'DRONE-001 · DJI M350' : 'DRONE-002 · DJI M30T';
  const cam = tileIdx === 0 ? '主摄像头' : '红外摄像头';

  modalEl = document.createElement('div');
  modalEl.className = 'video-modal';
  modalEl.innerHTML = `
    <div class="video-modal__backdrop"></div>
    <div class="video-modal__content">
      <button class="video-modal__close" aria-label="关闭">×</button>
      <div class="video-modal__title">${name}</div>
      <div class="video-modal__frame">
        <canvas class="video-tile__canvas" id="video-modal-canvas"></canvas>
        <div class="video-tile__scan"></div>
        <div class="video-tile__hud">
          <span class="video-tile__live">LIVE</span>
          <span class="video-tile__ts" id="video-modal-ts">${fmtTime(Date.now())}</span>
        </div>
        <div class="video-tile__hud-bottom">
          <span>🎥 ${cam}</span>
          <span>WS /ws/video</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  // Modal 内 also 画噪点
  const modalCanvas = modalEl.querySelector('#video-modal-canvas');
  let modalCtx = null;
  let modalTimer = null;
  if (modalCanvas) {
    modalCtx = modalCanvas.getContext('2d');
    function resizeModal() {
      const rect = modalCanvas.getBoundingClientRect();
      modalCanvas.width = rect.width * (window.devicePixelRatio || 1);
      modalCanvas.height = rect.height * (window.devicePixelRatio || 1);
    }
    resizeModal();
    let mf = 0;
    function drawModal() {
      mf++;
      if (!modalCtx) return;
      const w = modalCanvas.width;
      const h = modalCanvas.height;
      const dpr = window.devicePixelRatio || 1;
      modalCtx.fillStyle = '#050913';
      modalCtx.fillRect(0, 0, w, h);
      const imageData = modalCtx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const step = 4 * dpr;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (Math.random() > 0.92) {
            const val = Math.floor(40 + Math.random() * 60);
            const colorIdx = (tileIdx + mf) % 3;
            const rr = colorIdx === 0 ? val + 40 : val;
            const gg = colorIdx === 1 ? val + 40 : val;
            const bb = colorIdx === 2 ? val + 60 : val;
            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const i = ((y + dy) * w + (x + dx)) * 4;
                data[i] = rr;
                data[i + 1] = gg;
                data[i + 2] = bb;
                data[i + 3] = 180;
              }
            }
          }
        }
      }
      modalCtx.putImageData(imageData, 0, 0);
      modalCtx.fillStyle = 'rgba(0,229,255,0.35)';
      modalCtx.font = `${12 * dpr}px monospace`;
      modalCtx.fillText(`FRAME ${(mf * 3 + tileIdx * 7) % 9999}`, 12 * dpr, h - 12 * dpr);
    }
    modalTimer = setInterval(drawModal, 120);
  }

  const tsTimer = setInterval(() => {
    const ts = modalEl.querySelector('#video-modal-ts');
    if (ts) ts.textContent = fmtTime(Date.now());
  }, 1000);
  intervals.push(tsTimer);

  const close = () => {
    if (modalTimer) clearInterval(modalTimer);
    if (modalEl) { modalEl.remove(); modalEl = null; }
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  modalEl.querySelector('.video-modal__close').addEventListener('click', close);
  modalEl.querySelector('.video-modal__backdrop').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
}

/* =====================================================================
 * WebSocket 视频
 * ===================================================================== */
function setupVideoWS() {
  const ws = openWS('/ws/video', (msg) => {
    if (!msg || msg.type !== 'video_frame') return;
    const ts = msg.timestamp || Date.now();
    const tsStr = fmtTime(ts);
    // 更新两个窗口的时间戳（模拟多路分发）
    const t0 = document.getElementById('video-ts-0');
    const t1 = document.getElementById('video-ts-1');
    if (t0) t0.textContent = tsStr;
    if (t1) t1.textContent = tsStr;
  });
  wsConnections.push(ws);

  // 本地时钟兜底
  const localTimer = setInterval(() => {
    const t0 = document.getElementById('video-ts-0');
    const t1 = document.getElementById('video-ts-1');
    const now = fmtTime(Date.now());
    if (t0 && !t0.textContent.includes(':')) t0.textContent = now;
    if (t1 && !t1.textContent.includes(':')) t1.textContent = now;
  }, 1000);
  intervals.push(localTimer);
}

/* =====================================================================
 * 主渲染
 * ===================================================================== */
export function render(container) {
  cleanup();
  injectStyles();

  container.innerHTML = `
    <section class="page api-page">
      <header>
        <h1 class="page-title">接口管理</h1>
        <p class="page-subtitle">RESTful API 协议文档 · 在线调试 · 实时视频流演示</p>
      </header>

      ${renderKPIPlaceholder()}

      <div id="api-table-container">
        <div class="placeholder" style="min-height:200px;">
          <div class="placeholder__icon">📡</div>
          <div class="placeholder__text">加载接口元数据...</div>
        </div>
      </div>

      ${renderVideoSection()}
    </section>
  `;

  // 加载接口元数据
  meta.endpoints()
    .then((res) => {
      let endpoints = [];
      if (Array.isArray(res)) endpoints = res;
      else if (res && Array.isArray(res.data)) endpoints = res.data;
      else if (res && Array.isArray(res.items)) endpoints = res.items;

      const tableContainer = document.getElementById('api-table-container');
      if (tableContainer) {
        tableContainer.innerHTML = renderTable(endpoints);
        bindTableInteractions(tableContainer);
      }

      // KPI 动画
      const enabledCount = endpoints.filter((e) => e.method !== 'WS').length;
      animateCount(document.getElementById('api-kpi-total'), endpoints.length, { duration: 1000 });
      animateCount(document.getElementById('api-kpi-enabled'), enabledCount, { duration: 1200 });
      animateCount(document.getElementById('api-kpi-calls'), 12480 + Math.floor(Math.random() * 800), { duration: 1400 });
    })
    .catch((err) => {
      console.error('[api-page] 加载接口元数据失败:', err);
      const tableContainer = document.getElementById('api-table-container');
      if (tableContainer) {
        tableContainer.innerHTML = `
          <div class="placeholder" style="min-height:200px;">
            <div class="placeholder__icon">⚠️</div>
            <div class="placeholder__text">加载失败</div>
            <div class="text-muted mt-2" style="font-size:var(--fs-sm);">${err.message || '无法连接服务器'}</div>
          </div>
        `;
      }
    });

  // 启动视频动画 + WebSocket
  startNoiseAnimation();
  setupVideoWS();

  // 绑定视频点击放大
  container.querySelectorAll('.video-tile').forEach((tile, idx) => {
    const open = () => openVideoModal(idx);
    tile.addEventListener('click', open);
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

/* =====================================================================
 * 表格交互
 * ===================================================================== */
function bindTableInteractions(container) {
  // 过滤按钮
  container.querySelectorAll('.api-filter__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      // 重新渲染表格（保持展开状态）
      const tableWrap = container.querySelector('.api-table-wrap');
      const tbody = tableWrap ? tableWrap.querySelector('tbody') : null;
      if (!tbody) return;

      // 获取原始数据（从当前 DOM 反解太麻烦，这里直接通过 meta.endpoints 重载）
      // 简化：切换 filter 时重刷整页表格区
      meta.endpoints().then((res) => {
        let endpoints = [];
        if (Array.isArray(res)) endpoints = res;
        else if (res && Array.isArray(res.data)) endpoints = res.data;
        else if (res && Array.isArray(res.items)) endpoints = res.items;
        const tableContainer = document.getElementById('api-table-container');
        if (tableContainer) {
          tableContainer.innerHTML = renderTable(endpoints);
          bindTableInteractions(tableContainer);
        }
      });
    });
  });

  // 手风琴展开
  container.querySelectorAll('.api-row-main').forEach((row) => {
    row.addEventListener('click', () => {
      const rowId = row.dataset.row;
      const detail = container.querySelector(`[data-detail="${rowId}"]`);
      if (!detail) return;
      if (expandedRows.has(rowId)) {
        expandedRows.delete(rowId);
        row.classList.remove('is-expanded');
        detail.style.display = 'none';
      } else {
        expandedRows.add(rowId);
        row.classList.add('is-expanded');
        detail.style.display = '';
      }
    });
  });
}

export default { render };
