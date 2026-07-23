/* =====================================================================
 * business.js — 业务管理页（Task 13）
 * 巡检计划管理 · 隐患工单流转 · 整改复核闭环
 * ===================================================================== */

import { plans as plansApi, orders as ordersApi, drones as dronesApi } from '/js/api.js';

/* =====================================================================
 * 模块级状态
 * ===================================================================== */
let styleEl = null;
let toastEl = null;
let detailPanelEl = null;
let detailMaskEl = null;
let currentTab = 'plans';
let dronesCache = [];

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

const SEVERITY_INFO = {
  high: { label: '高', cls: 'badge-danger', color: 'var(--danger)' },
  medium: { label: '中', cls: 'badge-warn', color: 'var(--warn)' },
  low: { label: '低', cls: 'badge-success', color: 'var(--success)' }
};

const PLAN_STATUS_INFO = {
  pending: { label: '待执行', cls: 'badge-warn' },
  running: { label: '执行中', cls: 'badge-warn' },
  done: { label: '已完成', cls: 'badge-success' }
};

const ORDER_STATUS_INFO = {
  pending: { label: '待处理', cls: 'badge-danger' },
  processing: { label: '处理中', cls: 'badge-warn' },
  review: { label: '待复核', cls: '' },
  closed: { label: '已闭环', cls: 'badge-success' }
};

const KANBAN_COLUMNS = [
  { key: 'pending', label: '待处理' },
  { key: 'processing', label: '处理中' },
  { key: 'review', label: '待复核' },
  { key: 'closed', label: '已闭环' }
];

const STATUS_FLOW = ['pending', 'processing', 'review', 'closed'];

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

function fmtDateTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getAlarmInfo(alarmId) {
  return ALARMS_MAP[alarmId] || { type: '未知', severity: 'medium' };
}

/* =====================================================================
 * Toast
 * ===================================================================== */
function showToast(message, type = 'info') {
  if (toastEl) {
    toastEl.remove();
    toastEl = null;
  }
  toastEl = document.createElement('div');
  toastEl.className = `biz-toast biz-toast--${type}`;
  toastEl.textContent = message;
  document.body.appendChild(toastEl);

  requestAnimationFrame(() => {
    if (toastEl) toastEl.classList.add('is-visible');
  });

  setTimeout(() => {
    if (toastEl) {
      toastEl.classList.remove('is-visible');
      setTimeout(() => {
        if (toastEl) { toastEl.remove(); toastEl = null; }
      }, 300);
    }
  }, 2800);
}

/* =====================================================================
 * 样式注入
 * ===================================================================== */
function injectStyles() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', 'business');
  styleEl.textContent = `
/* ---------- 页面骨架 ---------- */
.biz-page { display: flex; flex-direction: column; gap: 16px; }

/* ---------- Tab 切换 ---------- */
.biz-tabs {
  display: flex; align-items: center; gap: 4px;
  border-bottom: 1px solid var(--border-base);
  margin-bottom: 4px;
}
.biz-tab {
  position: relative;
  padding: 10px 20px;
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--fg-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.biz-tab:hover { color: var(--fg-primary); background: rgba(0,229,255,0.04); }
.biz-tab.active {
  color: var(--accent-cyan);
  border-bottom-color: var(--accent-cyan);
  text-shadow: 0 0 8px rgba(0,229,255,0.4);
}
.biz-tab.active::after {
  content: ''; position: absolute; bottom: -2px; left: 20%; right: 20%;
  height: 2px; background: var(--accent-cyan);
  box-shadow: 0 0 8px var(--accent-cyan);
}

/* ---------- Tab 内容动画 ---------- */
.biz-tab-content {
  animation: fadeIn var(--duration-base) var(--ease-out);
}

/* ---------- 操作栏 ---------- */
.biz-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex-wrap: wrap;
}

/* ---------- 看板 ---------- */
.biz-kanban {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  min-height: 480px;
}
@media (max-width: 1280px) {
  .biz-kanban { grid-template-columns: repeat(2, 1fr); }
}

.biz-kanban-col {
  display: flex; flex-direction: column;
  background: rgba(10, 18, 36, 0.4);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  padding: 12px;
  min-height: 200px;
  transition: background var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}
.biz-kanban-col.is-dragover {
  background: rgba(0, 229, 255, 0.06);
  border-color: var(--border-glow);
  box-shadow: inset 0 0 24px rgba(0, 229, 255, 0.08);
}

.biz-kanban-col__head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-base);
}
.biz-kanban-col__title {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--fg-primary);
  letter-spacing: 0.5px;
  display: flex; align-items: center; gap: 8px;
}
.biz-kanban-col__title::before {
  content: ''; width: 3px; height: 14px;
  background: linear-gradient(180deg, var(--accent-cyan), var(--accent-blue));
  border-radius: var(--radius-sm);
}
.biz-kanban-col__count {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(0, 229, 255, 0.1);
  color: var(--accent-cyan);
  border: 1px solid rgba(0, 229, 255, 0.25);
}

.biz-kanban-col__body {
  display: flex; flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 60px;
}

/* ---------- 工单卡片 ---------- */
.biz-card {
  position: relative;
  background: rgba(17, 28, 54, 0.55);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: grab;
  transition: border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
  animation: slideInUp var(--duration-base) var(--ease-out) both;
}
.biz-card:hover {
  border-color: var(--border-glow);
  box-shadow: 0 4px 16px rgba(0,0,0,0.35), 0 0 12px rgba(0,229,255,0.08);
  transform: translateY(-2px);
}
.biz-card.is-dragging {
  opacity: 0.5;
  cursor: grabbing;
  transform: scale(0.98);
}
.biz-card__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  margin-bottom: 8px;
}
.biz-card__title {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--fg-primary);
  line-height: 1.35;
}
.biz-card__meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-bottom: 8px;
}
.biz-card__type {
  font-size: var(--fs-xs);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: rgba(0, 229, 255, 0.08);
  color: var(--accent-cyan);
  border: 1px solid rgba(0, 229, 255, 0.2);
}
.biz-card__time {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  font-family: var(--font-display);
}
.biz-card__footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 8px;
  border-top: 1px dashed rgba(0, 229, 255, 0.1);
}
.biz-card__assignee {
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
  display: flex; align-items: center; gap: 4px;
}
.biz-card__actions {
  display: flex; align-items: center; gap: 6px;
}

/* ---------- Modal ---------- */
.biz-modal {
  position: fixed; inset: 0; z-index: 9998;
  display: flex; align-items: center; justify-content: center;
}
.biz-modal[hidden] { display: none; }
.biz-modal__backdrop {
  position: absolute; inset: 0;
  background: rgba(5, 9, 19, 0.85);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: fadeIn 0.25s var(--ease-out);
}
.biz-modal__content {
  position: relative;
  width: min(520px, 92vw);
  background: linear-gradient(180deg, var(--bg-elev) 0%, var(--bg-base) 100%);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glow), 0 16px 64px rgba(0,0,0,0.6);
  overflow: hidden;
  animation: modalIn 0.35s var(--ease-out);
  display: flex; flex-direction: column;
  max-height: 90vh;
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.94) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.biz-modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-base);
  flex-shrink: 0;
}
.biz-modal__title {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--accent-cyan);
  letter-spacing: 1px;
}
.biz-modal__close {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: var(--fg-secondary);
  border: 1px solid var(--border-base);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.biz-modal__close:hover { color: var(--danger); border-color: rgba(255,59,107,0.5); background: rgba(255,59,107,0.12); }
.biz-modal__body { padding: 18px; overflow-y: auto; }
.biz-modal__footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-base);
  flex-shrink: 0;
}

/* ---------- 表单 ---------- */
.biz-form-group { margin-bottom: 14px; }
.biz-form-group:last-child { margin-bottom: 0; }
.biz-form-label {
  display: block;
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
.biz-form-label .required { color: var(--danger); margin-left: 2px; }
.biz-form-input, .biz-form-select, .biz-form-textarea {
  width: 100%;
  padding: 9px 12px;
  font-size: var(--fs-sm);
  color: var(--fg-primary);
  background: rgba(10, 18, 36, 0.7);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.biz-form-input:focus, .biz-form-select:focus, .biz-form-textarea:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(0, 229, 255, 0.12);
}
.biz-form-textarea { min-height: 80px; resize: vertical; }

/* ---------- 详情侧栏 ---------- */
.biz-detail {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 440px; max-width: 92vw;
  background: linear-gradient(180deg, rgba(17,28,54,0.98) 0%, rgba(5,9,19,0.98) 100%);
  border-left: 1px solid var(--border-glow);
  box-shadow: -16px 0 48px rgba(0,0,0,0.6);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  z-index: 1000;
  transform: translateX(100%);
  transition: transform var(--duration-base) var(--ease-out);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.biz-detail.is-open { transform: translateX(0); }
.biz-detail::before {
  content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 2px;
  background: linear-gradient(180deg, var(--accent-cyan), var(--accent-electric), transparent);
  box-shadow: 0 0 12px var(--accent-cyan);
}
.biz-detail__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-base);
  flex-shrink: 0;
}
.biz-detail__title {
  font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 600;
  letter-spacing: 1px; color: var(--fg-primary);
}
.biz-detail__close {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md);
  font-size: 22px; color: var(--fg-secondary);
  border: 1px solid var(--border-base);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.biz-detail__close:hover { color: var(--danger); border-color: rgba(255,59,107,0.5); background: rgba(255,59,107,0.12); }
.biz-detail__body { padding: 20px; overflow-y: auto; flex: 1; }
.biz-detail__section { margin-bottom: 18px; }
.biz-detail__section-title {
  font-family: var(--font-display); font-size: var(--fs-xs);
  color: var(--accent-cyan); letter-spacing: 1.5px; text-transform: uppercase;
  margin-bottom: 10px; padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  display: flex; align-items: center; gap: 6px;
}
.biz-detail__section-title::before { content: '▸'; color: var(--accent-cyan); }
.biz-detail__kv { display: grid; grid-template-columns: 80px 1fr; gap: 8px 12px; font-size: var(--fs-sm); }
.biz-detail__kv dt { color: var(--fg-muted); letter-spacing: 0.5px; }
.biz-detail__kv dd { color: var(--fg-primary); font-family: var(--font-display); word-break: break-all; }
.biz-detail__desc {
  padding: 10px 12px;
  background: rgba(0, 229, 255, 0.05);
  border-left: 2px solid var(--accent-cyan);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: var(--fs-sm); color: var(--fg-primary); line-height: 1.6;
}

.biz-detail-mask {
  position: fixed; inset: 0;
  background: rgba(5, 9, 19, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 999;
  opacity: 0; pointer-events: none;
  transition: opacity var(--duration-base) var(--ease-out);
}
.biz-detail-mask.is-open { opacity: 1; pointer-events: auto; }

/* ---------- Toast ---------- */
.biz-toast {
  position: fixed;
  top: calc(var(--topbar-height) + 16px);
  right: 24px;
  z-index: 10001;
  padding: 12px 20px;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--fg-primary);
  background: linear-gradient(135deg, var(--bg-elev), var(--bg-base));
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-glow);
  transform: translateX(120%);
  opacity: 0;
  transition: transform 0.35s var(--ease-out), opacity 0.35s var(--ease-out);
  pointer-events: none;
}
.biz-toast.is-visible { transform: translateX(0); opacity: 1; }
.biz-toast--success { border-color: rgba(0, 245, 160, 0.4); color: var(--success); }
.biz-toast--error   { border-color: rgba(255, 59, 107, 0.4); color: var(--danger); }
.biz-toast--warn    { border-color: rgba(255, 149, 0, 0.4); color: var(--warn); }

/* ---------- 动画 Keyframes（页面级补充） ---------- */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

/* ---------- 响应式 ---------- */
@media (max-width: 1280px) {
  .biz-kanban { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .biz-kanban { grid-template-columns: 1fr; }
  .biz-detail { width: 100vw; max-width: 100vw; }
}
`;
  document.head.appendChild(styleEl);
}

/* =====================================================================
 * Modal 工厂
 * ===================================================================== */
function openModal(title, bodyHtml, onConfirm) {
  const modal = document.createElement('div');
  modal.className = 'biz-modal';
  modal.innerHTML = `
    <div class="biz-modal__backdrop" data-action="cancel"></div>
    <div class="biz-modal__content">
      <div class="biz-modal__header">
        <span class="biz-modal__title">${title}</span>
        <button class="biz-modal__close" data-action="cancel" aria-label="关闭">×</button>
      </div>
      <div class="biz-modal__body">${bodyHtml}</div>
      <div class="biz-modal__footer">
        <button class="btn btn-ghost" data-action="cancel">取消</button>
        <button class="btn btn-primary" data-action="confirm">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  modal.querySelectorAll('[data-action="cancel"]').forEach((el) => {
    el.addEventListener('click', close);
  });
  modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    if (typeof onConfirm === 'function') {
      const result = onConfirm(modal);
      if (result !== false) close();
    } else {
      close();
    }
  });

  return modal;
}

/* =====================================================================
 * 新建计划 Modal
 * ===================================================================== */
function openCreatePlanModal(dronesList, onSubmit) {
  const droneOptions = dronesList.length
    ? dronesList.map((d) => `<option value="${d.id}">${d.id} · ${d.model || ''}</option>`).join('')
    : '<option value="">加载中...</option>';

  const body = `
    <div class="biz-form-group">
      <label class="biz-form-label">计划名称 <span class="required">*</span></label>
      <input class="biz-form-input" id="plan-name" placeholder="例如：大坝主体日常巡检" />
    </div>
    <div class="biz-form-group">
      <label class="biz-form-label">选择无人机 <span class="required">*</span></label>
      <select class="biz-form-select" id="plan-drone">
        <option value="">请选择</option>
        ${droneOptions}
      </select>
    </div>
    <div class="biz-form-group">
      <label class="biz-form-label">航线（文本描述或坐标输入）</label>
      <textarea class="biz-form-textarea" id="plan-route" placeholder="例如：30.6012,114.3025 → 30.6020,114.3050"></textarea>
    </div>
    <div class="biz-form-group">
      <label class="biz-form-label">巡检频次</label>
      <select class="biz-form-select" id="plan-freq">
        <option value="daily">每日</option>
        <option value="weekly">每周</option>
        <option value="monthly">每月</option>
      </select>
    </div>
    <div class="biz-form-group">
      <label class="biz-form-label">开始时间 <span class="required">*</span></label>
      <input class="biz-form-input" type="datetime-local" id="plan-start" />
    </div>
  `;

  openModal('新建巡检计划', body, () => {
    const name = document.getElementById('plan-name').value.trim();
    const droneId = document.getElementById('plan-drone').value;
    const routeRaw = document.getElementById('plan-route').value.trim();
    const frequency = document.getElementById('plan-freq').value;
    const startTime = document.getElementById('plan-start').value;

    if (!name || !droneId || !startTime) {
      showToast('请填写必填项：计划名称、无人机、开始时间', 'error');
      return false;
    }

    let route = [];
    if (routeRaw) {
      // 尝试解析坐标
      const pairs = routeRaw.split(/[→;\n]+/).map((s) => s.trim()).filter(Boolean);
      route = pairs.map((pair) => {
        const nums = pair.split(/[,，\s]+/).map(Number).filter((n) => !isNaN(n));
        return nums.length >= 2 ? { lat: nums[0], lng: nums[1] } : null;
      }).filter(Boolean);
    }

    onSubmit({ name, droneId, route, routeDesc: routeRaw, frequency, startTime: new Date(startTime).toISOString() });
  });
}

/* =====================================================================
 * 工单流转 Modal
 * ===================================================================== */
function openOrderFlowModal(order, newStatus, onSubmit) {
  const statusLabel = ORDER_STATUS_INFO[newStatus]?.label || newStatus;
  const body = `
    <div class="biz-form-group">
      <label class="biz-form-label">当前工单</label>
      <div class="biz-form-input" style="background:rgba(0,229,255,0.05);border-color:rgba(0,229,255,0.2);">${order.title}</div>
    </div>
    <div class="biz-form-group">
      <label class="biz-form-label">目标状态</label>
      <div class="biz-form-input" style="background:rgba(0,229,255,0.05);border-color:rgba(0,229,255,0.2);">${statusLabel}</div>
    </div>
    <div class="biz-form-group">
      <label class="biz-form-label">指派处理人</label>
      <input class="biz-form-input" id="flow-assignee" value="${order.assignee || ''}" placeholder="填写处理人姓名" />
    </div>
    <div class="biz-form-group">
      <label class="biz-form-label">处置意见</label>
      <textarea class="biz-form-textarea" id="flow-opinion" placeholder="填写处置意见或备注..."></textarea>
    </div>
  `;

  openModal('工单流转确认', body, () => {
    const assignee = document.getElementById('flow-assignee').value.trim();
    const opinion = document.getElementById('flow-opinion').value.trim();
    if (!assignee) {
      showToast('请填写处理人', 'error');
      return false;
    }
    onSubmit({ status: newStatus, assignee, opinion });
  });
}

/* =====================================================================
 * 详情侧栏
 * ===================================================================== */
function openDetailPanel(order) {
  const alarm = getAlarmInfo(order.alarmId);
  const sev = SEVERITY_INFO[alarm.severity] || SEVERITY_INFO.medium;
  const st = ORDER_STATUS_INFO[order.status] || { label: order.status || '--', cls: '' };

  const body = document.getElementById('biz-detail-body');
  if (!body) return;

  body.innerHTML = `
    <div class="biz-detail__section">
      <div class="biz-detail__section-title">基本信息</div>
      <dl class="biz-detail__kv">
        <dt>工单编号</dt><dd>${order.id}</dd>
        <dt>关联告警</dt><dd>${order.alarmId || '--'}</dd>
        <dt>告警类型</dt><dd><span class="badge ${sev.cls}">${alarm.type}</span></dd>
        <dt>严重级别</dt><dd><span class="badge ${sev.cls}">${sev.label}</span></dd>
        <dt>当前状态</dt><dd><span class="badge ${st.cls}">${st.label}</span></dd>
        <dt>处理人</dt><dd>${order.assignee || '--'}</dd>
        <dt>创建时间</dt><dd>${fmtDateTime(order.createdAt)}</dd>
        <dt>更新时间</dt><dd>${fmtDateTime(order.updatedAt)}</dd>
      </dl>
    </div>
    <div class="biz-detail__section">
      <div class="biz-detail__section-title">问题描述</div>
      <div class="biz-detail__desc">${order.description || '暂无描述'}</div>
    </div>
    ${order.opinion ? `
    <div class="biz-detail__section">
      <div class="biz-detail__section-title">处置意见</div>
      <div class="biz-detail__desc">${order.opinion}</div>
    </div>
    ` : ''}
  `;

  const panel = document.getElementById('biz-detail');
  const mask = document.getElementById('biz-detail-mask');
  if (panel) { panel.classList.add('is-open'); panel.setAttribute('aria-hidden', 'false'); }
  if (mask) mask.classList.add('is-open');
}

function closeDetailPanel() {
  const panel = document.getElementById('biz-detail');
  const mask = document.getElementById('biz-detail-mask');
  if (panel) { panel.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); }
  if (mask) mask.classList.remove('is-open');
}

/* =====================================================================
 * 数据加载
 * ===================================================================== */
async function loadPlans() {
  try {
    const res = await plansApi.list();
    return unwrap(res);
  } catch (err) {
    console.warn('[business] 加载巡检计划失败:', err.message || err);
    return [];
  }
}

async function loadOrders() {
  try {
    const res = await ordersApi.list();
    return unwrap(res);
  } catch (err) {
    console.warn('[business] 加载工单失败:', err.message || err);
    return [];
  }
}

async function loadDrones() {
  try {
    const res = await dronesApi.list();
    const list = unwrap(res, []);
    dronesCache = list;
    return list;
  } catch (err) {
    console.warn('[business] 加载无人机失败:', err.message || err);
    dronesCache = [];
    return [];
  }
}

/* =====================================================================
 * 渲染：巡检计划 Tab
 * ===================================================================== */
function renderPlansTab(container, plansData, dronesMap) {
  const rows = plansData.map((p) => {
    const st = PLAN_STATUS_INFO[p.status] || { label: p.status || '--', cls: '' };
    const droneName = dronesMap[p.droneId] ? `${p.droneId} · ${dronesMap[p.droneId].model}` : p.droneId;
    const freqLabel = { daily: '每日', weekly: '每周', monthly: '每月' }[p.frequency] || p.frequency;
    return `
      <tr>
        <td>${p.name}</td>
        <td>${droneName}</td>
        <td>${freqLabel}</td>
        <td>${fmtDateTime(p.startTime)}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="biz-tab-content">
      <div class="biz-toolbar mb-4">
        <div></div>
        <button class="btn btn-primary" id="btn-create-plan">+ 新建计划</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="table">
          <thead>
            <tr>
              <th>计划名称</th>
              <th>无人机</th>
              <th>频次</th>
              <th>开始时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="text-align:center;color:var(--fg-muted);">暂无巡检计划</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =====================================================================
 * 渲染：隐患工单 Tab（看板）
 * ===================================================================== */
function renderOrdersTab(container, ordersData) {
  const counts = {};
  KANBAN_COLUMNS.forEach((c) => { counts[c.key] = ordersData.filter((o) => o.status === c.key).length; });

  const colsHtml = KANBAN_COLUMNS.map((col) => {
    const cards = ordersData
      .filter((o) => o.status === col.key)
      .map((o, i) => renderOrderCard(o, i))
      .join('');

    return `
      <div class="biz-kanban-col" data-status="${col.key}">
        <div class="biz-kanban-col__head">
          <span class="biz-kanban-col__title">${col.label}</span>
          <span class="biz-kanban-col__count">${counts[col.key]}</span>
        </div>
        <div class="biz-kanban-col__body">
          ${cards || '<div style="text-align:center;color:var(--fg-muted);font-size:var(--fs-xs);padding:20px 0;">暂无工单</div>'}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="biz-tab-content">
      <div class="biz-kanban">
        ${colsHtml}
      </div>
    </div>
  `;
}

function renderOrderCard(order, index) {
  const alarm = getAlarmInfo(order.alarmId);
  const sev = SEVERITY_INFO[alarm.severity] || SEVERITY_INFO.medium;
  return `
    <div class="biz-card" draggable="true" data-id="${order.id}" data-status="${order.status}" style="--i:${index}">
      <div class="biz-card__head">
        <div class="biz-card__title">${order.title}</div>
      </div>
      <div class="biz-card__meta">
        <span class="biz-card__type">${alarm.type}</span>
        <span class="badge ${sev.cls}">${sev.label}</span>
      </div>
      <div class="biz-card__time">${fmtDateTime(order.createdAt)}</div>
      <div class="biz-card__footer">
        <span class="biz-card__assignee">👤 ${order.assignee || '--'}</span>
        <div class="biz-card__actions">
          <button class="btn btn-ghost" style="padding:4px 8px;font-size:var(--fs-xs);" data-action="detail" data-id="${order.id}">查看详情</button>
        </div>
      </div>
    </div>
  `;
}

/* =====================================================================
 * 看板交互：拖拽 + 详情
 * ===================================================================== */
function bindKanbanInteractions(container, ordersData, onRefresh) {
  const cards = container.querySelectorAll('.biz-card');
  const columns = container.querySelectorAll('.biz-kanban-col');

  cards.forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
    });
  });

  columns.forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('is-dragover');
    });
    col.addEventListener('dragleave', () => {
      col.classList.remove('is-dragover');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('is-dragover');
      const id = e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;
      const order = ordersData.find((o) => o.id === id);
      if (!order) return;

      const currentIdx = STATUS_FLOW.indexOf(order.status);
      const targetIdx = STATUS_FLOW.indexOf(newStatus);
      if (targetIdx <= currentIdx) {
        showToast('工单只能向前流转', 'warn');
        return;
      }

      openOrderFlowModal(order, newStatus, async (data) => {
        try {
          await ordersApi.update(id, data);
          showToast('工单流转成功', 'success');
          onRefresh();
        } catch (err) {
          console.error('[business] 更新工单失败:', err);
          showToast('工单流转失败：' + (err.message || '未知错误'), 'error');
        }
      });
    });
  });

  // 查看详情
  container.querySelectorAll('[data-action="detail"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const order = ordersData.find((o) => o.id === id);
      if (order) openDetailPanel(order);
    });
  });
}

/* =====================================================================
 * Tab 切换
 * ===================================================================== */
async function switchTab(tabKey, container) {
  currentTab = tabKey;
  const contentEl = container.querySelector('#biz-content');
  if (!contentEl) return;

  // 更新 Tab 激活态
  container.querySelectorAll('.biz-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabKey);
  });

  if (tabKey === 'plans') {
    const [plansData, drones] = await Promise.all([loadPlans(), loadDrones()]);
    const dronesMap = {};
    drones.forEach((d) => { dronesMap[d.id] = d; });
    renderPlansTab(contentEl, plansData, dronesMap);

    // 绑定新建计划
    const btn = contentEl.querySelector('#btn-create-plan');
    if (btn) {
      btn.addEventListener('click', () => {
        openCreatePlanModal(drones, async (data) => {
          try {
            await plansApi.create(data);
            showToast('巡检计划创建成功', 'success');
            await switchTab('plans', container);
          } catch (err) {
            console.error('[business] 创建计划失败:', err);
            showToast('创建失败：' + (err.message || '未知错误'), 'error');
          }
        });
      });
    }
  } else if (tabKey === 'orders') {
    const ordersData = await loadOrders();
    renderOrdersTab(contentEl, ordersData);
    const refreshOrders = async () => {
      const fresh = await loadOrders();
      renderOrdersTab(contentEl, fresh);
      bindKanbanInteractions(contentEl, fresh, refreshOrders);
    };
    bindKanbanInteractions(contentEl, ordersData, refreshOrders);
  }
}

/* =====================================================================
 * 清理
 * ===================================================================== */
function cleanup() {
  if (styleEl) { styleEl.remove(); styleEl = null; }
  if (toastEl) { toastEl.remove(); toastEl = null; }
  // 清理可能残留的 modal
  document.querySelectorAll('.biz-modal').forEach((m) => m.remove());
}

/* =====================================================================
 * 主渲染入口
 * ===================================================================== */
export function render(container) {
  cleanup();
  injectStyles();

  container.innerHTML = `
    <section class="page biz-page">
      <h1 class="page-title">业务管理</h1>
      <p class="page-subtitle">巡检计划 · 隐患工单 · 整改复核</p>

      <div class="biz-tabs">
        <button class="biz-tab active" data-tab="plans">巡检计划</button>
        <button class="biz-tab" data-tab="orders">隐患工单</button>
      </div>

      <div class="biz-content" id="biz-content"></div>
    </section>

    <aside class="biz-detail" id="biz-detail" aria-hidden="true">
      <div class="biz-detail__header">
        <span class="biz-detail__title">工单详情</span>
        <button class="biz-detail__close" id="biz-detail-close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="biz-detail__body" id="biz-detail-body"></div>
    </aside>
    <div class="biz-detail-mask" id="biz-detail-mask"></div>
  `;

  // Tab 切换绑定
  container.querySelectorAll('.biz-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab !== currentTab) {
        switchTab(tab.dataset.tab, container);
      }
    });
  });

  // 详情侧栏关闭
  const closeBtn = container.querySelector('#biz-detail-close');
  const mask = container.querySelector('#biz-detail-mask');
  if (closeBtn) closeBtn.addEventListener('click', closeDetailPanel);
  if (mask) mask.addEventListener('click', closeDetailPanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailPanel();
  });

  // 默认加载巡检计划
  switchTab('plans', container);
}

export default { render };
