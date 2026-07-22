const express = require('express');
const DataStore = require('../data/dataStore');
const { success, error } = require('../utils/response');
const { signToken } = require('../middleware/auth');

const authRouter = express.Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return error(res, '用户名和密码必填', 400);
  }
  
  const user = DataStore.users.getByUsername(username);
  if (!user || user.password !== password) {
    return error(res, '用户名或密码错误', 401);
  }
  
  const token = signToken({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name
  });
  
  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: user.username,
    action: 'login',
    target: '-',
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  success(res, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    }
  }, '登录成功');
});

authRouter.get('/me', (req, res) => {
  success(res, req.user, '获取当前用户信息成功');
});

authRouter.post('/logout', (req, res) => {
  if (req.user && req.user.username) {
    DataStore.auditLogs.add({
      id: `LOG-${String(Date.now()).slice(-6)}`,
      user: req.user.username,
      action: 'logout',
      target: '-',
      ip: req.ip || '-',
      timestamp: new Date().toISOString()
    });
  }
  success(res, {}, '退出成功');
});

authRouter.post('/users', (req, res) => {
  const { username, password, role, name } = req.body || {};
  
  if (!username || !password || !role) {
    return error(res, '参数不合法：username、password、role 必填', 400);
  }
  
  if (DataStore.users.getByUsername(username)) {
    return error(res, '用户名已存在', 400);
  }
  
  const users = DataStore.users.getAll();
  const newUser = {
    id: `USER-${String(users.length + 1).padStart(3, '0')}`,
    username,
    password,
    role: role || 'viewer',
    name: name || username
  };
  
  DataStore.users.add(newUser);
  
  if (req.user && req.user.username) {
    DataStore.auditLogs.add({
      id: `LOG-${String(Date.now()).slice(-6)}`,
      user: req.user.username,
      action: 'create_user',
      target: newUser.id,
      ip: req.ip || '-',
      timestamp: new Date().toISOString()
    });
  }

  success(res, newUser, '用户创建成功');
});

const auditLogsRouter = express.Router();

auditLogsRouter.get('/', (req, res) => {
  const { keyword, startDate, endDate, page, pageSize } = req.query;
  let list = DataStore.auditLogs.getAll();

  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((log) => {
      return (
        (log.user && log.user.toLowerCase().includes(kw)) ||
        (log.action && log.action.toLowerCase().includes(kw)) ||
        (log.target && log.target.toLowerCase().includes(kw)) ||
        (log.id && log.id.toLowerCase().includes(kw))
      );
    });
  }

  if (startDate) {
    const start = new Date(startDate).getTime();
    if (!Number.isNaN(start)) {
      list = list.filter((log) => new Date(log.timestamp).getTime() >= start);
    }
  }

  if (endDate) {
    const end = new Date(endDate).getTime();
    if (!Number.isNaN(end)) {
      list = list.filter((log) => new Date(log.timestamp).getTime() <= end);
    }
  }

  const total = list.length;
  const currentPage = parseInt(page) || 1;
  const size = parseInt(pageSize) || 20;
  const startIdx = (currentPage - 1) * size;
  const paginated = list.slice(startIdx, startIdx + size);

  success(res, {
    total,
    page: currentPage,
    pageSize: size,
    items: paginated
  }, '获取审计日志成功');
});

module.exports = { authRouter, auditLogsRouter };