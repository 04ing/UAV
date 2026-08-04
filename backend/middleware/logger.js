// 请求日志中间件 + 内存审计日志
// 记录 method、url、ip、耗时、用户信息，并写入内存审计日志数组

const auditLogs = [];
const MAX_LOGS = 1000;

function logger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;
  // 兼容代理场景下的真实 IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  
  // 获取认证用户信息
  const userInfo = req.user ? `${req.user.username}(${req.user.role})` : 'anonymous';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const ts = new Date().toISOString();
    
    // 根据状态码输出不同颜色
    let statusColor = '\x1b[32m'; // green
    if (res.statusCode >= 400) statusColor = '\x1b[33m'; // yellow
    if (res.statusCode >= 500) statusColor = '\x1b[31m'; // red
    
    console.log(`[${ts}] ${method} ${originalUrl} ${statusColor}${res.statusCode}\x1b[0m ${duration}ms ${ip} ${userInfo}`);

    auditLogs.push({
      id: `REQ-${auditLogs.length + 1}`,
      method,
      url: originalUrl,
      ip,
      user: req.user ? req.user.username : 'anonymous',
      statusCode: res.statusCode,
      duration,
      timestamp: ts
    });

    // 防止无限增长
    if (auditLogs.length > MAX_LOGS) {
      auditLogs.shift();
    }
  });

  next();
}

function getAuditLogs() {
  return auditLogs;
}

module.exports = { logger, getAuditLogs, auditLogs };
