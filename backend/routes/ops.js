// Task 6：运维与日志 API
// 包含 /api/auth 与 /api/audit-logs 两类路由

const express = require('express');
const mock = require('../data/mock');
const { success, error } = require('../utils/response');
const { signToken } = require('../middleware/auth');

const usersCache = mock.getUsers();
const auditLogsCache = mock.getAuditLogs();

// ---------- 鉴权路由 ----------
const authRouter = express.Router();

// POST /api/auth/login —— 登录
authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return error(res, '用户名和密码必填', 400);
  }
  const user = usersCache.find((u) => u.username === username && u.password === password);
  if (!user) {
    return error(res, '用户名或密码错误', 401);
  }
  // 签发 token，仅包含非敏感字段
  const token = signToken({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name
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

// GET /api/auth/me —— 当前用户信息（需 requireAuth）
authRouter.get('/me', (req, res) => {
  // requireAuth 已校验 token 并将解码后的 payload 挂到 req.user
  success(res, req.user, '获取当前用户信息成功');
});

// ---------- 审计日志路由 ----------
const auditLogsRouter = express.Router();

// GET /api/audit-logs —— 支持 ?keyword=、?startDate=、?endDate= 过滤
auditLogsRouter.get('/', (req, res) => {
  const { keyword, startDate, endDate } = req.query;
  let list = auditLogsCache;

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

  success(res, list, '获取审计日志成功');
});

module.exports = { authRouter, auditLogsRouter };
