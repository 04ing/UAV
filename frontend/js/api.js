/* =====================================================================
 * api.js — API 客户端
 * 原生 ES Module · fetch + WebSocket 封装
 * ===================================================================== */

const BASE = '/api';

const TOKEN_KEY = 'drone_token';

/* =====================================================================
 * 通用请求封装
 * ===================================================================== */

/**
 * 取本地存储的 token
 * @returns {string | null}
 */
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 设置 / 清除 token
 */
function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * 跳转到登录页（占位实现）
 */
function redirectToLogin() {
  // 后续 Task 接入登录页时：window.location.href = '/pages/login.html';
  // 简化流程下仅清 token 并刷新
  setToken(null);
  if (!window.location.hash.startsWith('#/login')) {
    // 触发 app.js 的 hashchange 处理（如存在 login 路由）
    // 当前简化方案：提示并刷新
    console.warn('[api] 鉴权失败，跳转登录页（占位：刷新当前页）');
    // window.location.reload();
  }
}

/**
 * fetch 封装：自动注入 Authorization、处理 401、解析 JSON
 * @param {string} path  相对 BASE 的路径，如 '/drones'
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const headers = new Headers(options.headers || {});

  // 自动 JSON 头
  if (options.body && !headers.has('Content-Type')) {
    if (!(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
  }

  // 自动注入 Bearer token
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    console.error(`[api] 网络错误 ${path}:`, err);
    throw new Error(`网络错误：${err.message || '无法连接服务器'}`);
  }

  // 401 → 跳登录
  if (response.status === 401) {
    redirectToLogin();
    throw new Error('未授权或登录已过期');
  }

  // 解析响应
  const contentType = response.headers.get('Content-Type') || '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    if (isJson) {
      try {
        const errBody = await response.json();
        detail = errBody.message || errBody.error || detail;
      } catch (_) { /* ignore */ }
    }
    const err = new Error(detail);
    err.status = response.status;
    throw err;
  }

  if (isJson) return response.json();
  if (response.status === 204) return null;
  return response.text();
}

/* =====================================================================
 * WebSocket 工厂
 * ===================================================================== */

/**
 * 创建 WebSocket 连接，自动附带 token query
 * @param {string} path 相对 BASE 的路径，如 '/drones/1/telemetry'
 * @param {(msg: any) => void} onMessage 收到消息回调（消息体自动 JSON.parse）
 * @returns {WebSocket}
 */
function connectWS(path, onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const token = getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const url = `${proto}//${host}${BASE}${path}${qs}`;

  const ws = new WebSocket(url);

  ws.onmessage = (event) => {
    if (typeof onMessage !== 'function') return;
    let payload = event.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) { /* 非 JSON 时保持原字符串 */ }
    }
    onMessage(payload);
  };

  ws.onerror = (err) => {
    console.error(`[ws] 连接错误 ${path}:`, err);
  };

  return ws;
}

/* =====================================================================
 * 业务分组 API
 * ===================================================================== */

/* ---------- 飞控 / 无人机 ---------- */
const drones = {
  /** 无人机列表 */
  list: (params) => request('/drones', { method: 'GET' }),
  /** 单架无人机详情 */
  detail: (id) => request(`/drones/${id}`, { method: 'GET' }),
  /** 一键返航 */
  returnHome: (id) => request(`/drones/${id}/return-home`, { method: 'POST' }),
  /** 实时遥测数据（WebSocket） */
  telemetry: (id, onMessage) => connectWS(`/drones/${id}/telemetry`, onMessage)
};

/* ---------- AI 智能识别 ---------- */
const ai = {
  /** 提交图片识别（FormData 上传文件） */
  recognize: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/ai/recognize', { method: 'POST', body: fd });
  },
  /** 已部署模型列表 */
  models: () => request('/ai/models', { method: 'GET' }),
  /** 部署指定模型 */
  deployModel: (id) => request(`/ai/models/${id}/deploy`, { method: 'POST' })
};

/* ---------- 巡检计划 ---------- */
const plans = {
  list: (params) => request('/inspection-plans', { method: 'GET' }),
  detail: (id) => request(`/inspection-plans/${id}`, { method: 'GET' }),
  /** 创建巡检计划 */
  create: (data) => request('/inspection-plans', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/inspection-plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request(`/inspection-plans/${id}`, { method: 'DELETE' })
};

/* ---------- 业务工单 ---------- */
const orders = {
  list: (params) => request('/work-orders', { method: 'GET' }),
  detail: (id) => request(`/work-orders/${id}`, { method: 'GET' }),
  update: (id, data) => request(`/work-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) })
};

/* ---------- 鉴权 ---------- */
const auth = {
  /** 登录，成功后保存 token */
  login: async (username, password) => {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    const data = result && result.data ? result.data : result;
    if (data && data.token) {
      setToken(data.token);
      if (data.user && data.user.name) {
        localStorage.setItem('drone_user_name', data.user.name);
      }
    }
    return result;
  },
  logout: () => {
    setToken(null);
    localStorage.removeItem('drone_user_name');
  },
  /** 当前用户信息 */
  me: () => request('/auth/me', { method: 'GET' })
};

/* ---------- 审计日志 ---------- */
const audit = {
  /** @param {{page?:number, pageSize?:number, keyword?:string, startDate?:string, endDate?:string}} [params] */
  list: (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/audit-logs${qs}`, { method: 'GET' });
  }
};

/* ---------- 电子围栏 ---------- */
const geoFences = {
  list: () => request('/geo-fences', { method: 'GET' }),
  create: (data) => request('/geo-fences', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id) => request(`/geo-fences/${id}`, { method: 'DELETE' })
};

/* ---------- 接口元数据 ---------- */
const meta = {
  /** 列出所有后端接口元信息 */
  endpoints: () => request('/meta/endpoints', { method: 'GET' })
};

/* =====================================================================
 * 导出
 * ===================================================================== */
export {
  BASE,
  request,
  connectWS,
  getToken,
  setToken,
  drones,
  ai,
  plans,
  orders,
  auth,
  audit,
  geoFences,
  meta
};

export default {
  BASE,
  request,
  connectWS,
  drones,
  ai,
  plans,
  orders,
  auth,
  audit,
  geoFences,
  meta
};
