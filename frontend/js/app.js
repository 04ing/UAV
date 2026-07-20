/* =====================================================================
 * app.js — SPA 路由与布局控制
 * 原生 ES Module · 无框架
 * ===================================================================== */

import { auth } from './api.js';

/* ---------- 路由配置：12 个菜单项 ---------- */
const ROUTES = {
  'login':       { title: '登录',        module: () => import('/pages/login.js') },
  'overview':    { title: '架构总览',    module: () => import('/pages/overview.js') },
  'dashboard':   { title: '中控大屏',    module: () => import('/pages/dashboard.js') },
  'flight':      { title: '飞控管理',    module: () => import('/pages/flight.js') },
  'ai-recognize':{ title: 'AI智能识别',  module: () => import('/pages/ai-recognize.js') },
  'business':    { title: '业务管理',    module: () => import('/pages/business.js') },
  'gis':         { title: 'GIS监控',     module: () => import('/pages/gis.js') },
  'three':       { title: '三维展示',    module: () => import('/pages/three.js') },
  'report':      { title: '巡检报表',    module: () => import('/pages/report.js') },
  'ops':         { title: '运维安全',    module: () => import('/pages/ops.js') },
  'api':         { title: '接口管理',    module: () => import('/pages/api.js') },
  'ai-algorithm':{ title: 'AI算法',      module: () => import('/pages/ai-algorithm.js') }
};

const DEFAULT_ROUTE = 'dashboard';
const AUTH_ROUTES = Object.keys(ROUTES).filter(key => key !== 'login');
const VIEW_CONTAINER_ID = 'view';

/* =====================================================================
 * Router
 * ===================================================================== */
const router = {
  current: null,

  /**
   * 推入新路由
   * @param {string} key 路由 key（ROUTES 中的键）
   */
  async push(key) {
    if (!ROUTES[key]) {
      console.warn(`[router] 未知路由 key: ${key}，回退到默认路由`);
      key = DEFAULT_ROUTE;
    }

    if (!(await guard(key))) {
      return;
    }

    this.current = key;
    this._setActiveNav(key);
    this._updateDocumentTitle(key);

    const container = document.getElementById(VIEW_CONTAINER_ID);
    if (!container) {
      console.error('[router] #view 容器未找到');
      return;
    }

    const hasRealContent = container.children.length > 0 && !container.querySelector('.placeholder');
    const modPromise = ROUTES[key].module();

    // 旧页面 fadeOut（300ms）
    if (hasRealContent) {
      container.classList.add('is-exiting');
      await new Promise(r => setTimeout(r, 300));
      if (this.current !== key) return;
      container.classList.remove('is-exiting');
    }

    // 渲染骨架（在动态 import 期间显示，避免空白）
    container.innerHTML = `
      <section class="page">
        <div class="placeholder">
          <div class="placeholder__icon">◌</div>
          <div class="placeholder__text">加载中 · ${ROUTES[key].title}</div>
        </div>
      </section>
    `;

    try {
      const mod = await modPromise;
      if (typeof mod.render !== 'function') {
        throw new Error(`页面模块 ${key} 未导出 render 函数`);
      }
      // 切换路由时如模块已变（用户快速点击），放弃本次渲染
      if (this.current !== key) return;
      mod.render(container);
    } catch (err) {
      console.error(`[router] 加载页面 ${key} 失败:`, err);
      container.innerHTML = `
        <section class="page">
          <div class="placeholder">
            <div class="placeholder__icon">⚠️</div>
            <div class="placeholder__text">页面加载失败</div>
            <div class="text-muted mt-2" style="font-size:var(--fs-sm);">
              ${String(err.message || err)}
            </div>
          </div>
        </section>
      `;
    }
  },

  /** 设置菜单激活态 */
  _setActiveNav(key) {
    const items = document.querySelectorAll('.sidebar__nav-item');
    items.forEach((el) => {
      const route = el.getAttribute('data-route');
      if (route === key) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  },

  /** 同步浏览器标题 */
  _updateDocumentTitle(key) {
    const title = ROUTES[key]?.title || '';
    document.title = title
      ? `${title} · 无人机智能巡检系统`
      : '无人机智能巡检系统';
  }
};

/* =====================================================================
 * 鉴权守卫
 * ===================================================================== */
async function guard(key) {
  const token = localStorage.getItem('drone_token');
  
  if (key === 'login') {
    if (token) {
      router.push(DEFAULT_ROUTE);
      return false;
    }
    return true;
  }
  
  if (!token) {
    router.push('login');
    return false;
  }
  
  return true;
}

/* =====================================================================
 * 顶部时钟：每秒更新 YYYY-MM-DD HH:mm:ss
 * ===================================================================== */
function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;

  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    el.textContent =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  tick();
  setInterval(tick, 1000);
}

/* =====================================================================
 * 用户信息 & 退出登录
 * ===================================================================== */
function initUserArea() {
  const userName = localStorage.getItem('drone_user_name') || '运维管理员';
  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = userName;
  if (avatarEl) avatarEl.textContent = (userName[0] || 'U').toUpperCase();

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (!confirm('确定要退出登录吗？')) return;
      localStorage.removeItem('drone_token');
      localStorage.removeItem('drone_user_name');
      // 简化：直接刷新，后续接入登录页时跳登录页
      window.location.reload();
    });
  }
}

/* =====================================================================
 * 底部状态栏实时数据（占位）
 * ===================================================================== */
function startStatusTicker() {
  const cpuEl = document.getElementById('cpu-usage');
  const memEl = document.getElementById('mem-usage');
  const netEl = document.getElementById('net-status');
  const onlineEl = document.getElementById('online-drones');
  const backendEl = document.getElementById('backend-status');

  const tick = () => {
    const cpu = (10 + Math.random() * 40).toFixed(0);
    const mem = (30 + Math.random() * 40).toFixed(0);
    const drones = Math.floor(Math.random() * 12);
    if (cpuEl) cpuEl.textContent = `${cpu}%`;
    if (memEl) memEl.textContent = `${mem}%`;
    if (netEl) netEl.textContent = '✓ 正常';
    if (onlineEl) onlineEl.textContent = String(drones);
    if (backendEl) backendEl.textContent = '✓ 已连接';
  };

  tick();
  setInterval(tick, 5000);
}

/* =====================================================================
 * 菜单点击事件代理
 * ===================================================================== */
function initNavEvents() {
  const nav = document.getElementById('nav-menu');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const item = e.target.closest('.sidebar__nav-item');
    if (!item) return;
    e.preventDefault();
    const route = item.getAttribute('data-route');
    if (route) router.push(route);
  });
}

/* =====================================================================
 * Hash 路由：#/<key>
 * ===================================================================== */
function parseHash() {
  const hash = window.location.hash || '';
  const key = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  
  if (key && ROUTES[key]) {
    return key;
  }
  
  const token = localStorage.getItem('drone_token');
  return token ? DEFAULT_ROUTE : 'login';
}

function initHashListener() {
  window.addEventListener('hashchange', () => {
    router.push(parseHash());
  });
}

/* =====================================================================
 * 启动
 * ===================================================================== */
function boot() {
  initNavEvents();
  initUserArea();
  startClock();
  startStatusTicker();
  initHashListener();

  // 首次进入：根据 hash 路由，否则使用默认路由
  const initial = parseHash();
  router.push(initial);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// 暴露到 window 便于调试（非必需）
window.__router = router;

export default router;
