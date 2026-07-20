const BASE = '/api';
const TOKEN_KEY = 'drone_token';

const MOCK_DATA = {
  drones: [
    { id: 'DJI2024001', model: 'M30T', battery: 85, signal: '强', status: 'inspecting', lat: 31.2304, lng: 121.4737, altitude: 100, speed: 5.5, heading: 45, name: '无人机001', lastUpdate: new Date().toISOString() },
    { id: 'DJI2024002', model: 'M210RTK', battery: 72, signal: '强', status: 'inspecting', lat: 31.2306, lng: 121.4739, altitude: 80, speed: 3.2, heading: 120, name: '无人机002', lastUpdate: new Date().toISOString() },
    { id: 'DJI2024003', model: 'M350RTK', battery: 45, signal: '强', status: 'idle', lat: 31.23, lng: 121.473, altitude: 0, speed: 0, heading: 0, name: '无人机003', lastUpdate: new Date().toISOString() }
  ],
  aiModels: [
    { id: 1, name: '缺陷检测模型', version: 'v2.1', status: 'deployed', accuracy: 96.5 },
    { id: 2, name: '目标识别模型', version: 'v1.8', status: 'deployed', accuracy: 94.2 },
    { id: 3, name: '异常检测模型', version: 'v3.0', status: 'testing', accuracy: 92.8 }
  ],
  plans: [
    { id: 'PLAN-001', name: '电站巡检计划', status: 'active', frequency: 'daily', lastRun: '2024-01-15 09:00', nextRun: '2024-01-16 09:00', drones: ['DJI2024001', 'DJI2024002'] },
    { id: 'PLAN-002', name: '桥梁巡检计划', status: 'active', frequency: 'weekly', lastRun: '2024-01-10 14:00', nextRun: '2024-01-17 14:00', drones: ['DJI2024003'] }
  ],
  orders: [
    { id: 'WO-001', title: '光伏板破损', status: 'pending', priority: 'high', location: 'A区-01', createTime: '2024-01-15 10:30', droneId: 'DJI2024001' },
    { id: 'WO-002', title: '设备过热预警', status: 'processing', priority: 'medium', location: 'B区-12', createTime: '2024-01-14 16:45', droneId: 'DJI2024002' },
    { id: 'WO-003', title: '异物入侵检测', status: 'completed', priority: 'low', location: 'C区-05', createTime: '2024-01-13 09:20', droneId: 'DJI2024003' }
  ],
  auditLogs: Array.from({ length: 20 }, (_, i) => ({
    id: `LOG-${String(i + 1).padStart(4, '0')}`,
    user: ['admin', 'user1', 'user2'][Math.floor(Math.random() * 3)],
    action: ['登录系统', '查询无人机', '下发任务', '查看报表', '导出数据'][Math.floor(Math.random() * 5)],
    target: ['无人机管理', '任务中心', '数据报表'][Math.floor(Math.random() * 3)],
    timestamp: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
    ip: `192.168.1.${Math.floor(Math.random() * 255)}`
  })),
  geoFences: [
    { id: 'GF-001', name: '禁飞区域-A', type: 'polygon', coordinates: [[31.23, 121.47], [31.23, 121.48], [31.24, 121.48], [31.24, 121.47]], status: 'active' },
    { id: 'GF-002', name: '作业区域-B', type: 'polygon', coordinates: [[31.22, 121.46], [31.22, 121.47], [31.23, 121.47], [31.23, 121.46]], status: 'active' }
  ],
  endpoints: [
    { path: '/api/drones', method: 'GET', description: '获取无人机列表' },
    { path: '/api/drones/:id', method: 'GET', description: '获取无人机详情' },
    { path: '/api/auth/login', method: 'POST', description: '用户登录' },
    { path: '/api/ai/recognize', method: 'POST', description: 'AI图像识别' }
  ]
};

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }

async function request(path, options = {}) {
  if (!getToken()) {
    throw new Error('未登录');
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      let result = {};
      if (path === '/drones') {
        result = { code: 0, msg: '获取机队列表成功', data: MOCK_DATA.drones };
      } else if (path.startsWith('/drones/')) {
        const id = path.split('/')[2];
        result = { code: 0, msg: '获取无人机详情成功', data: MOCK_DATA.drones.find(d => d.id === id) || MOCK_DATA.drones[0] };
      } else if (path === '/ai/models') {
        result = { code: 0, msg: '获取模型列表成功', data: MOCK_DATA.aiModels };
      } else if (path === '/inspection-plans') {
        result = { code: 0, msg: '获取巡检计划成功', data: MOCK_DATA.plans };
      } else if (path.startsWith('/inspection-plans/')) {
        const id = path.split('/')[2];
        result = { code: 0, msg: '获取巡检计划详情成功', data: MOCK_DATA.plans.find(p => p.id === id) || MOCK_DATA.plans[0] };
      } else if (path === '/work-orders') {
        result = { code: 0, msg: '获取工单列表成功', data: MOCK_DATA.orders };
      } else if (path.startsWith('/work-orders/')) {
        const id = path.split('/')[2];
        result = { code: 0, msg: '获取工单详情成功', data: MOCK_DATA.orders.find(o => o.id === id) || MOCK_DATA.orders[0] };
      } else if (path === '/audit-logs') {
        result = { code: 0, msg: '获取审计日志成功', data: MOCK_DATA.auditLogs };
      } else if (path === '/geo-fences') {
        result = { code: 0, msg: '获取电子围栏成功', data: MOCK_DATA.geoFences };
      } else if (path === '/meta/endpoints') {
        result = { code: 0, msg: '获取接口列表成功', data: MOCK_DATA.endpoints };
      } else if (path === '/auth/me') {
        result = { code: 0, msg: '获取用户信息成功', data: { id: 'USER-001', username: 'admin', role: 'admin', name: '系统管理员' } };
      } else if (path.startsWith('/drones/') && path.endsWith('/return-home')) {
        result = { code: 0, msg: '返航指令已下发', data: {} };
      } else {
        result = { code: -1, msg: '接口未实现', data: null };
      }
      resolve(result);
    }, 200 + Math.random() * 300);
  });
}

function connectWS(path, onMessage) {
  const mockData = MOCK_DATA.drones[0];
  const interval = setInterval(() => {
    if (typeof onMessage === 'function') {
      onMessage({
        id: mockData.id,
        model: mockData.model,
        battery: Math.max(10, mockData.battery - Math.random() * 0.5),
        altitude: mockData.altitude + (Math.random() - 0.5) * 5,
        speed: mockData.speed + (Math.random() - 0.5) * 0.5,
        lat: mockData.lat + (Math.random() - 0.5) * 0.0001,
        lng: mockData.lng + (Math.random() - 0.5) * 0.0001,
        heading: (mockData.heading + Math.random() * 10) % 360,
        timestamp: new Date().toISOString()
      });
    }
  }, 1000);

  return {
    close: () => clearInterval(interval),
    send: () => {}
  };
}

const drones = {
  list: () => request('/drones', { method: 'GET' }),
  detail: (id) => request(`/drones/${id}`, { method: 'GET' }),
  returnHome: (id) => request(`/drones/${id}/return-home`, { method: 'POST' }),
  telemetry: (id, onMessage) => connectWS(`/drones/${id}/telemetry`, onMessage)
};

const ai = {
  recognize: (file) => Promise.resolve({ code: 0, msg: '识别完成（模拟）', data: { defects: [] } }),
  models: () => request('/ai/models', { method: 'GET' }),
  deployModel: (id) => Promise.resolve({ code: 0, msg: '模型部署完成（模拟）', data: {} })
};

const plans = {
  list: () => request('/inspection-plans', { method: 'GET' }),
  detail: (id) => request(`/inspection-plans/${id}`, { method: 'GET' }),
  create: (data) => Promise.resolve({ code: 0, msg: '计划创建成功（模拟）', data: { ...data, id: 'PLAN-' + Date.now() } }),
  update: (id, data) => Promise.resolve({ code: 0, msg: '计划更新成功（模拟）', data: {} }),
  remove: (id) => Promise.resolve({ code: 0, msg: '计划删除成功（模拟）', data: {} })
};

const orders = {
  list: () => request('/work-orders', { method: 'GET' }),
  detail: (id) => request(`/work-orders/${id}`, { method: 'GET' }),
  update: (id, data) => Promise.resolve({ code: 0, msg: '工单更新成功（模拟）', data: {} })
};

const auth = {
  login: async (username, password) => {
    if (username === 'admin' && password === 'admin123') {
      const token = 'gh-pages-mock-token-' + Date.now();
      setToken(token);
      localStorage.setItem('drone_user_name', '系统管理员');
      return { code: 0, msg: '登录成功', data: { token, user: { id: 'USER-001', username: 'admin', role: 'admin', name: '系统管理员' } } };
    }
    throw new Error('用户名或密码错误');
  },
  logout: () => { setToken(null); localStorage.removeItem('drone_user_name'); },
  me: () => request('/auth/me', { method: 'GET' })
};

const audit = {
  list: () => request('/audit-logs', { method: 'GET' })
};

const geoFences = {
  list: () => request('/geo-fences', { method: 'GET' }),
  create: (data) => Promise.resolve({ code: 0, msg: '围栏创建成功（模拟）', data: { ...data, id: 'GF-' + Date.now() } }),
  remove: (id) => Promise.resolve({ code: 0, msg: '围栏删除成功（模拟）', data: {} })
};

const meta = {
  endpoints: () => request('/meta/endpoints', { method: 'GET' })
};

export { BASE, request, connectWS, getToken, setToken, drones, ai, plans, orders, auth, audit, geoFences, meta };
export default { BASE, request, connectWS, drones, ai, plans, orders, auth, audit, geoFences, meta };