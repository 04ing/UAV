// 请求日志中间件 + 内存审计日志
// 记录 method、url、ip、耗时，并写入内存审计日志数组

const auditLogs = [];
const MAX_LOGS = 1000;

function logger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;
  // 兼容代理场景下的真实 IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${method} ${originalUrl} ${res.statusCode} ${duration}ms ${ip}`);

    auditLogs.push({
      id: `REQ-${auditLogs.length + 1}`,
      method,
      url: originalUrl,
      ip,
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
