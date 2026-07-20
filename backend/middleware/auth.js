// JWT 鉴权中间件 + 角色控制
const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

// 演示用密钥，生产环境应从环境变量读取
const JWT_SECRET = 'drone-inspection-demo-secret-2026';
const JWT_EXPIRES_IN = '8h';

// 鉴权白名单（不需要 token 即可访问）
const WHITELIST = ['/api/auth/login', '/api/meta/endpoints'];

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireAuth(req, res, next) {
  // 仅业务 API 需要鉴权；静态资源、SPA、WebSocket 升级等跳过
  if (!req.path.startsWith('/api')) {
    return next();
  }
  // 白名单跳过
  if (WHITELIST.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return error(res, '未提供认证令牌', 401);
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return error(res, '认证令牌无效或已过期', 401);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, '未认证用户', 401);
    }
    if (!roles.includes(req.user.role)) {
      return error(res, '权限不足', 403);
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  signToken,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
