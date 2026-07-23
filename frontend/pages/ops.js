/* =====================================================================
 * ops.js — 运维安全页 · Task 17
 * 用户权限管理 · 操作日志审计
 * ===================================================================== */

import { auth, audit, request } from '/js/api.js';

/* =====================================================================
 * 模块级状态
 * ===================================================================== */
let styleEl = null;
let currentTab = 'users'; // 'users' | 'audit'
let auditDataCache = [];
let auditPage = 1;
const PAGE_SIZE = 10;

/* =====================================================================
 * 兜底数据
 * ===================================================================== */
const FALLBACK_USERS = [
  { id: 'USER-001', username: 'admin', name: '系统管理员', role: 'admin', status: 'enabled', lastLogin: '2026-07-20T08:00:00Z' },
  { id: 'USER-002', username: 'operator1', name: '张操作员', role: 'operator', status: 'enabled', lastLogin: '2026-07-20T08:10:00Z' },
  { id: 'USER-003', username: 'viewer1', name: '李查看员', role: 'viewer', status: 'enabled', lastLogin: '2026-07-20T09:35:00Z' }
];

const FALLBACK_AUDIT = [
  { id: 'LOG-001', user: 'admin', action: 'login', target: '-', ip: '192.168.1.10', timestamp: '2026-07-20T08:00:00Z', status: 'success' },
  { id: 'LOG-002', user: 'admin', action: 'create', target: 'PLAN-001', ip: '192.168.1.10', timestamp: '2026-07-20T08:05:00Z', status: 'success' },
  { id: 'LOG-003', user: 'operator1', action: 'login', target: '-', ip: '192.168.1.11', timestamp: '2026-07-20T08:10:00Z', status: 'success' },
  { id: 'LOG-004', user: 'operator1', action: 'start_inspection', target: 'PLAN-001', ip: '192.168.1.11', timestamp: '2026-07-20T08:15:00Z', status: 'success' },
  { id: 'LOG-005', user: 'operator1', action: 'ack_alarm', target: 'ALARM-001', ip: '192.168.1.11', timestamp: '2026-07-20T09:16:00Z', status: 'success' },
  { id: 'LOG-006', user: 'admin', action: 'create_work_order', target: 'WO-001', ip: '192.168.1.10', timestamp: '2026-07-20T09:20:00Z', status: 'success' },
  { id: 'LOG-007', user: 'operator1', action: 'update_work_order', target: 'WO-002', ip: '192.168.1.11', timestamp: '2026-07-20T09:30:00Z', status: 'success' },
  { id: 'LOG-008', user: 'viewer1', action: 'login', target: '-', ip: '192.168.1.12', timestamp: '2026-07-20T09:35:00Z', status: 'success' },
  { id: 'LOG-009', user: 'viewer1', action: 'view_alarm', target: 'ALARM-004', ip: '192.168.1.12', timestamp: '2026-07-20T09:40:00Z', status: 'success' },
  { id: 'LOG-010', user: 'admin', action: 'deploy_model', target: 'MODEL-001', ip: '192.168.1.10', timestamp: '2026-07-20T09:45:00Z', status: 'success' },
  { id: 'LOG-011', user: 'operator1', action: 'close_alarm', target: 'ALARM-004', ip: '192.168.1.11', timestamp: '2026-07-20T10:00:00Z', status: 'success' },
  { id: 'LOG-012', user: 'admin', action: 'update_geofence', target: 'GEOFENCE-001', ip: '192.168.1.10', timestamp: '2026-07-20T10:05:00Z', status: 'success' },
  { id: 'LOG-013', user: 'operator1', action: 'return_drone', target: 'DRONE-003', ip: '192.168.1.11', timestamp: '2026-07-20T10:10:00Z', status: 'success' },
  { id: 'LOG-014', user: 'admin', action: 'create_user', target: 'USER-003', ip: '192.168.1.10', timestamp: '2026-07-20T10:15:00Z', status: 'success' },
  { id: 'LOG-015', user: 'viewer1', action: 'logout', target: '-', ip: '192.168.1.12', timestamp: '2026-07-20T10:20:00Z', status: 'success' }
];

const ROLE_MAP = {
  admin: { label: '管理员', desc: '系统管理员' },
  operator: { label: '操作员', desc: '巡检操作员' },
  viewer: { label: '查看者', desc: '只读查看员' }
};

const MENU_PERMISSIONS = [
  { menu: '中控大屏', admin: true, operator: true, viewer: true },
  { menu: '飞控管理', admin: true, operator: true, viewer: false },
  { menu: 'AI 智能识别', admin: true, operator: true, viewer: false },
  { menu: '业务管理', admin: true, operator: true, viewer: false },
  { menu: 'GIS 监控', admin: true, operator: true, viewer: true },
  { menu: '三维展示', admin: true, operator: true, viewer: true },
  { menu: '巡检报表', admin: true, operator: true, viewer: true },
  { menu: '运维安全', admin: true, operator: false, viewer: false },
  { menu: '接口管理', admin: true, operator: false, viewer: false },
  { menu: 'AI 算法', admin: true, operator: false, viewer: false }
];

const ACTION_LABELS = {
  login: '登录',
  logout: '登出',
  create: '创建',
  start_inspection: '开始巡检',
  ack_alarm: '确认告警',
  create_work_order: '创建工单',
  update_work_order: '更新工单',
  view_alarm: '查看告警',
  deploy_model: '部署模型',
  close_alarm: '关闭告警',
  update_geofence: '更新围栏',
  return_drone: '一键返航',
  create_user: '创建用户'
};

/* =====================================================================
 * 工具函数
 * ===================================================================== */
function fmtDateTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isRecent(ts, minutes = 5) {
  const t = new Date(ts).getTime();
  return !isNaN(t) && (Date.now() - t) <= minutes * 60 * 1000;
}

function roleLabel(role) {
  return ROLE_MAP[role]?.label || role;
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

/* =====================================================================
 * CSS 注入
 * ===================================================================== */
function injectStyles() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', 'ops');
  styleEl.textContent = `
/* ---------- 页面骨架 ---------- */
.ops-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: calc(100vh - var(--topbar-height) - var(--statusbar-height) - 40px);
}

/* ---------- Tab 栏 ---------- */
.ops-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-base);
  margin-bottom: 4px;
}
.ops-tab {
  position: relative;
  padding: 10px 20px;
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--fg-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.ops-tab:hover {
  color: var(--fg-primary);
  background: rgba(0, 229, 255, 0.04);
}
.ops-tab.active {
  color: var(--accent-cyan);
  border-bottom-color: var(--accent-cyan);
  text-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
}
.ops-tab.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 20%;
  width: 60%;
  height: 2px;
  background: var(--accent-cyan);
  box-shadow: 0 0 8px var(--accent-cyan);
}

/* ---------- Tab 内容 fadeIn ---------- */
.ops-tab-panel {
  animation: opsFadeIn 0.5s var(--ease-out);
}
@keyframes opsFadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ---------- 用户信息卡片 ---------- */
.ops-user-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
}
.ops-user-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--bg-deep);
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.3);
}
.ops-user-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ops-user-name {
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--fg-primary);
  letter-spacing: 1px;
}
.ops-user-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
}
.ops-user-meta .badge {
  font-size: var(--fs-xs);
}

/* ---------- 权限表格 ---------- */
.ops-perm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
  background: rgba(10, 18, 36, 0.4);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-base);
}
.ops-perm-table thead th {
  background: rgba(0, 229, 255, 0.06);
  color: var(--accent-cyan);
  font-weight: 600;
  font-family: var(--font-display);
  text-align: left;
  padding: 12px 16px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-glow);
  font-size: var(--fs-xs);
  text-transform: uppercase;
}
.ops-perm-table tbody td {
  padding: 11px 16px;
  color: var(--fg-secondary);
  border-bottom: 1px solid rgba(0, 229, 255, 0.06);
  text-align: center;
}
.ops-perm-table tbody td:first-child {
  text-align: left;
  color: var(--fg-primary);
  font-weight: 500;
}
.ops-perm-table tbody tr:last-child td {
  border-bottom: none;
}
.ops-perm-table tbody tr:hover td {
  background: rgba(0, 229, 255, 0.04);
}
.ops-perm-yes {
  color: var(--success);
  font-weight: 700;
  font-size: var(--fs-base);
}
.ops-perm-no {
  color: var(--fg-muted);
  font-size: var(--fs-base);
}

/* ---------- 用户列表 ---------- */
.ops-user-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ops-user-item {
  display: grid;
  grid-template-columns: 1fr 120px 100px 120px;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(10, 18, 36, 0.4);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--ease-out);
}
.ops-user-item:hover {
  background: rgba(0, 229, 255, 0.04);
  border-color: var(--border-glow);
}
.ops-user-item__name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ops-user-item__name strong {
  color: var(--fg-primary);
  font-size: var(--fs-sm);
}
.ops-user-item__name span {
  color: var(--fg-muted);
  font-size: var(--fs-xs);
}

/* ---------- 开关 ---------- */
.ops-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}
.ops-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.ops-switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--fg-muted);
  border-radius: 24px;
  transition: background var(--duration-fast) var(--ease-out);
}
.ops-switch-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: var(--fg-primary);
  border-radius: 50%;
  transition: transform var(--duration-fast) var(--ease-out);
}
.ops-switch input:checked + .ops-switch-slider {
  background: var(--success);
}
.ops-switch input:checked + .ops-switch-slider::before {
  transform: translateX(20px);
}

/* ---------- 审计筛选栏 ---------- */
.ops-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  background: rgba(10, 18, 36, 0.4);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
}
.ops-filter-bar input[type="text"] {
  min-width: 200px;
}
.ops-filter-bar input[type="date"] {
  min-width: 140px;
  color-scheme: dark;
}

/* ---------- 审计表格 ---------- */
.ops-audit-table-wrap {
  overflow-x: auto;
}
.ops-audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
  background: rgba(10, 18, 36, 0.4);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-base);
}
.ops-audit-table thead th {
  background: rgba(0, 229, 255, 0.06);
  color: var(--accent-cyan);
  font-weight: 600;
  font-family: var(--font-display);
  text-align: left;
  padding: 12px 16px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-glow);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  white-space: nowrap;
}
.ops-audit-table tbody td {
  padding: 11px 16px;
  color: var(--fg-secondary);
  border-bottom: 1px solid rgba(0, 229, 255, 0.06);
  transition: background var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}
.ops-audit-table tbody tr:last-child td {
  border-bottom: none;
}
.ops-audit-table tbody tr:hover td {
  background: rgba(0, 229, 255, 0.04);
  color: var(--fg-primary);
}
.ops-audit-table tbody tr.is-recent td {
  background: rgba(0, 229, 255, 0.06);
  color: var(--accent-cyan);
}
.ops-audit-table tbody tr.is-recent:hover td {
  background: rgba(0, 229, 255, 0.10);
}

/* ---------- 分页 ---------- */
.ops-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0;
}
.ops-pagination__info {
  font-size: var(--fs-sm);
  color: var(--fg-secondary);
  margin-right: 8px;
}
.ops-pagination__btn {
  padding: 6px 14px;
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-base);
  background: rgba(255, 255, 255, 0.03);
  color: var(--fg-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.ops-pagination__btn:hover:not(:disabled) {
  color: var(--fg-primary);
  border-color: var(--border-glow);
  background: rgba(0, 229, 255, 0.08);
}
.ops-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ops-pagination__btn.active {
  background: var(--accent-cyan);
  color: var(--bg-deep);
  border-color: var(--accent-cyan);
  font-weight: 600;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1280px) {
  .ops-user-item {
    grid-template-columns: 1fr 100px 90px 100px;
  }
}
@media (max-width: 768px) {
  .ops-user-item {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .ops-filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .ops-filter-bar input,
  .ops-filter-bar button {
    width: 100%;
  }
}
`;
  document.head.appendChild(styleEl);
}

/* =====================================================================
 * 清理
 * ===================================================================== */
function cleanup() {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

/* =====================================================================
 * Tab 切换
 * ===================================================================== */
function switchTab(tab, container) {
  if (currentTab === tab) return;
  currentTab = tab;

  // 更新按钮状态
  container.querySelectorAll('.ops-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // 渲染内容
  const panel = container.querySelector('.ops-tab-content');
  if (!panel) return;

  if (tab === 'users') {
    renderUsersTab(panel);
  } else {
    renderAuditTab(panel);
  }
}

/* =====================================================================
 * 用户权限 Tab
 * ===================================================================== */
function renderUsersTab(panel) {
  panel.innerHTML = `
    <div class="ops-tab-panel">
      <!-- 当前用户信息 -->
      <div class="card ops-user-card" id="ops-current-user">
        <div class="ops-user-avatar" id="ops-user-avatar">?</div>
        <div class="ops-user-info">
          <div class="ops-user-name" id="ops-user-name">加载中...</div>
          <div class="ops-user-meta">
            <span class="badge badge-success" id="ops-user-role">--</span>
            <span id="ops-user-lastlogin">最后登录: --</span>
          </div>
        </div>
      </div>

      <!-- 角色权限说明 -->
      <div class="card">
        <div class="card__title">角色权限对照</div>
        <table class="ops-perm-table">
          <thead>
            <tr>
              <th>菜单项</th>
              <th>管理员</th>
              <th>操作员</th>
              <th>查看者</th>
            </tr>
          </thead>
          <tbody>
            ${MENU_PERMISSIONS.map((p) => `
              <tr>
                <td>${p.menu}</td>
                <td><span class="ops-perm-yes">✓</span></td>
                <td><span class="ops-perm-${p.operator ? 'yes' : 'no'}">${p.operator ? '✓' : '✕'}</span></td>
                <td><span class="ops-perm-${p.viewer ? 'yes' : 'no'}">${p.viewer ? '✓' : '✕'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card__title">用户列表</div>
        <div class="ops-user-list" id="ops-user-list">
          <div class="loading">加载中...</div>
        </div>
      </div>
    </div>
  `;

  // 绑定开关与重置密码事件
  panel.querySelectorAll('.ops-switch input').forEach((sw) => {
    sw.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const enabled = e.target.checked;
      console.log(`[ops] 用户 ${id} 状态切换为: ${enabled ? '启用' : '禁用'}`);
    });
  });
  panel.querySelectorAll('[data-action="reset-pwd"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      if (confirm(`确定重置用户 ${id} 的密码吗？`)) {
        alert('密码重置成功（模拟）');
      }
    });
  });

  // 加载当前用户信息和用户列表
  loadCurrentUser();
  loadUserList();
}

async function loadUserList() {
  const container = document.getElementById('ops-user-list');
  if (!container) return;

  try {
    const res = await request.get('/api/auth/users');
    let users = [];
    if (Array.isArray(res)) users = res;
    else if (res && Array.isArray(res.data)) users = res.data;

    if (users.length > 0) {
      container.innerHTML = users.map((u) => renderUserItem(u)).join('');
      
      container.querySelectorAll('.ops-switch input').forEach((sw) => {
        sw.addEventListener('change', (e) => {
          const id = e.target.dataset.id;
          const enabled = e.target.checked;
          console.log(`[ops] 用户 ${id} 状态切换为: ${enabled ? '启用' : '禁用'}`);
        });
      });
      container.querySelectorAll('[data-action="reset-pwd"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = e.target.dataset.id;
          if (confirm(`确定重置用户 ${id} 的密码吗？`)) {
            alert('密码重置成功');
          }
        });
      });
    } else {
      container.innerHTML = '<div class="empty">暂无用户数据</div>';
    }
  } catch (err) {
    console.warn('[ops] 加载用户列表失败:', err);
    container.innerHTML = '<div class="empty">加载失败</div>';
  }
}

function renderUserItem(user) {
  const role = ROLE_MAP[user.role] || { label: user.role, desc: user.role };
  return `
    <div class="ops-user-item">
      <div class="ops-user-item__name">
        <strong>${user.name}</strong>
        <span>@${user.username}</span>
      </div>
      <div>
        <span class="badge ${user.role === 'admin' ? 'badge-danger' : user.role === 'operator' ? 'badge-warn' : ''}">
          ${role.label}
        </span>
      </div>
      <div>
        <label class="ops-switch">
          <input type="checkbox" data-id="${user.id}" ${user.status === 'enabled' ? 'checked' : ''}>
          <span class="ops-switch-slider"></span>
        </label>
      </div>
      <div>
        <button class="btn btn-ghost" data-id="${user.id}" data-action="reset-pwd">重置密码</button>
      </div>
    </div>
  `;
}

async function loadCurrentUser() {
  try {
    const user = await auth.me();
    const nameEl = document.getElementById('ops-user-name');
    const avatarEl = document.getElementById('ops-user-avatar');
    const roleEl = document.getElementById('ops-user-role');
    const loginEl = document.getElementById('ops-user-lastlogin');

    if (nameEl) nameEl.textContent = user.name || user.username || '未知用户';
    if (avatarEl) avatarEl.textContent = (user.name?.[0] || user.username?.[0] || 'U').toUpperCase();
    if (roleEl) {
      roleEl.textContent = roleLabel(user.role);
      roleEl.className = 'badge ' + (user.role === 'admin' ? 'badge-danger' : user.role === 'operator' ? 'badge-warn' : '');
    }
    if (loginEl) loginEl.textContent = '最后登录: ' + fmtDateTime(new Date());
  } catch (err) {
    console.warn('[ops] 获取当前用户信息失败:', err);
    const nameEl = document.getElementById('ops-user-name');
    const avatarEl = document.getElementById('ops-user-avatar');
    const roleEl = document.getElementById('ops-user-role');
    const loginEl = document.getElementById('ops-user-lastlogin');
    if (nameEl) nameEl.textContent = '未登录';
    if (avatarEl) avatarEl.textContent = '?';
    if (roleEl) {
      roleEl.textContent = '未知';
      roleEl.className = 'badge';
    }
    if (loginEl) loginEl.textContent = '最后登录: 未知';
  }
}

/* =====================================================================
 * 日志审计 Tab
 * ===================================================================== */
function renderAuditTab(panel, data = null, page = 1) {
  const list = data || auditDataCache;
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = list.slice(start, start + PAGE_SIZE);

  panel.innerHTML = `
    <div class="ops-tab-panel">
      <!-- 筛选栏 -->
      <div class="ops-filter-bar">
        <input type="text" id="audit-keyword" placeholder="搜索关键字（操作人 / 类型 / 目标）" value="">
        <input type="date" id="audit-start" placeholder="开始日期">
        <input type="date" id="audit-end" placeholder="结束日期">
        <button class="btn btn-primary" id="audit-search-btn">查询</button>
      </div>

      <!-- 表格 -->
      <div class="card ops-audit-table-wrap">
        <table class="ops-audit-table">
          <thead>
            <tr>
              <th>操作人</th>
              <th>操作时间</th>
              <th>操作类型</th>
              <th>目标对象</th>
              <th>IP 地址</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${pageData.length ? pageData.map((log) => {
              const recent = isRecent(log.timestamp);
              return `
                <tr class="${recent ? 'is-recent' : ''}">
                  <td><strong>${log.user}</strong></td>
                  <td>${fmtDateTime(log.timestamp)}</td>
                  <td>${actionLabel(log.action)}</td>
                  <td>${log.target}</td>
                  <td>${log.ip}</td>
                  <td><span class="badge badge-success">成功</span></td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="6" style="text-align:center;color:var(--fg-muted);padding:32px;">暂无数据</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="ops-pagination">
        <span class="ops-pagination__info">共 ${total} 条 · 第 ${currentPage} / ${totalPages} 页</span>
        <button class="ops-pagination__btn" id="audit-prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
        ${Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => `
          <button class="ops-pagination__btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>
        `).join('')}
        <button class="ops-pagination__btn" id="audit-next" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
      </div>
    </div>
  `;

  // 绑定查询
  const searchBtn = panel.querySelector('#audit-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => performAuditSearch(panel));
  }

  // 绑定分页
  const prevBtn = panel.querySelector('#audit-prev');
  const nextBtn = panel.querySelector('#audit-next');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) renderAuditTab(panel, list, currentPage - 1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages) renderAuditTab(panel, list, currentPage + 1);
    });
  }
  panel.querySelectorAll('.ops-pagination__btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const p = Number(e.target.dataset.page);
      if (p && p !== currentPage) renderAuditTab(panel, list, p);
    });
  });
}

async function performAuditSearch(panel) {
  const keyword = document.getElementById('audit-keyword')?.value.trim() || '';
  const startDate = document.getElementById('audit-start')?.value || '';
  const endDate = document.getElementById('audit-end')?.value || '';

  try {
    let data;
    try {
      // 优先使用 api.audit.list（按需求指定的接口）
      data = await audit.list({ keyword, startDate, endDate });
    } catch (firstErr) {
      // 若路径不匹配（/audit vs /audit-logs），尝试直接请求正确路径
      if (firstErr.status === 404 || (firstErr.message && firstErr.message.includes('404'))) {
        const qs = new URLSearchParams({ keyword, startDate, endDate }).toString();
        data = await request(`/audit-logs?${qs}`, { method: 'GET' });
      } else {
        throw firstErr;
      }
    }

    // 兼容多种返回结构
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.data)) ? data.data : [];
    // 按时间倒序，最新在顶部
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    auditDataCache = list;
    auditPage = 1;
    renderAuditTab(panel, auditDataCache, auditPage);
  } catch (err) {
    console.warn('[ops] 审计日志查询失败，使用兜底数据:', err);
    // 本地过滤兜底数据
    let filtered = [...FALLBACK_AUDIT];
    if (keyword) {
      const kw = keyword.toLowerCase();
      filtered = filtered.filter((l) =>
        (l.user && l.user.toLowerCase().includes(kw)) ||
        (l.action && l.action.toLowerCase().includes(kw)) ||
        (l.target && l.target.toLowerCase().includes(kw)) ||
        (l.id && l.id.toLowerCase().includes(kw))
      );
    }
    if (startDate) {
      const s = new Date(startDate).getTime();
      if (!isNaN(s)) filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      if (!isNaN(e)) filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= e);
    }
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    auditDataCache = filtered;
    auditPage = 1;
    renderAuditTab(panel, auditDataCache, auditPage);
  }
}

/* =====================================================================
 * render —— 主入口
 * ===================================================================== */
export function render(container) {
  cleanup();
  injectStyles();
  currentTab = 'users';
  auditDataCache = [...FALLBACK_AUDIT];
  auditPage = 1;

  container.innerHTML = `
    <section class="page ops-page">
      <header>
        <h1 class="page-title">运维安全</h1>
        <p class="page-subtitle">用户权限管理 · 操作日志审计 · 系统安全策略</p>
      </header>

      <!-- Tab 栏 -->
      <div class="ops-tabs">
        <button class="ops-tab active" data-tab="users">用户权限</button>
        <button class="ops-tab" data-tab="audit">日志审计</button>
      </div>

      <!-- Tab 内容区 -->
      <div class="ops-tab-content"></div>
    </section>
  `;

  const tabs = container.querySelectorAll('.ops-tab');
  const content = container.querySelector('.ops-tab-content');

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab, container));
  });

  // 默认渲染用户权限 Tab
  renderUsersTab(content);
}

export default { render };
