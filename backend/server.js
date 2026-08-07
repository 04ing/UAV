require('dotenv').config();

// 仅在未设置时提供默认值，避免硬编码路径导致跨机器运行失败
if (!process.env.ULTRALYTICS_SETTINGS) {
  process.env.ULTRALYTICS_SETTINGS = '';
}
if (!process.env.HOME) {
  process.env.HOME = require('path').dirname(__dirname);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { logger } = require('./middleware/logger');
const { requireAuth } = require('./middleware/auth');
const DataStore = require('./data/dataStore');
const EventEmitter = require('./utils/eventEmitter');

const { dronesRouter, geoFencesRouter } = require('./routes/drones');
const aiRouter = require('./routes/ai');
const { plansRouter, workOrdersRouter, alarmsRouter } = require('./routes/business');
const { authRouter, auditLogsRouter, backupRouter } = require('./routes/ops');
const metaRouter = require('./routes/meta');
const DJIAPI = require('./utils/djiApiAdapter');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ============ 安全中间件 ============

// 1. Helmet：设置安全响应头（XSS 防护、内容类型嗅探防护、HSTS 等）
app.use(helmet({
  contentSecurityPolicy: false,  // 前端用了内联脚本，关闭 CSP 避免阻断
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,  // HTTP 环境下 COOP 会被浏览器忽略并警告
}));

// 2. 路径遍历防护：拦截包含 %2F.. 或 ../ 的路径遍历攻击
app.use((req, res, next) => {
  const decoded = decodeURIComponent(req.path);
  if (decoded.includes('../') || decoded.includes('..\\') || /%2e%2e/i.test(req.url)) {
    return res.status(403).json({ code: -1, msg: '请求路径不合法', data: null });
  }
  next();
});

// 3. 全局限流：每个 IP 每 15 分钟最多 300 次请求
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: -1, msg: '请求过于频繁，请稍后重试', data: null },
});
app.use(limiter);

// 4. 登录接口加强限流：每个 IP 每 15 分钟最多 20 次登录尝试
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: -1, msg: '登录尝试次数过多，请 15 分钟后重试', data: null },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// 静态文件根目录限定（防止目录穿越）
app.use(express.static(path.join(__dirname, '../frontend'), {
  dotfiles: 'deny',   // 禁止访问 .git 等隐藏文件
}));

app.use(requireAuth);

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/meta', metaRouter);

app.use('/api/drones', dronesRouter);
app.use('/api/geo-fences', geoFencesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/inspection-plans', plansRouter);
app.use('/api/work-orders', workOrdersRouter);
app.use('/api/alarms', alarmsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/ops/backup', backupRouter);

const frontendIndex = path.join(__dirname, '../frontend/index.html');
app.get('*', (req, res, next) => {
  // 仅后端API子路径走API路由，/api 根路径返回前端页面（接口管理页）
  if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(frontendIndex, (err) => {
    if (err) {
      res.status(404).send('Frontend index.html not found.');
    }
  });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || '服务器内部错误';
  const timestamp = new Date().toISOString();
  
  console.error(`[${timestamp}] ERROR ${status} ${req.method} ${req.originalUrl}`);
  console.error('[ERROR] Message:', message);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    console.error('[ERROR] Stack:', err.stack);
  }
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(status).json({
    code: -1,
    msg: process.env.NODE_ENV === 'production' && status >= 500 ? '服务器内部错误' : message,
    data: null,
    timestamp
  });
});

const server = http.createServer(app);

const wssVideo = new WebSocketServer({ noServer: true });
wssVideo.on('connection', (ws) => {
  console.log('[WS] video client connected');
  ws.on('close', () => {
    console.log('[WS] video client disconnected');
  });
});

const wssAlarm = new WebSocketServer({ noServer: true });
wssAlarm.on('connection', (ws) => {
  console.log('[WS] alarm client connected');
  ws.on('close', () => {
    console.log('[WS] alarm client disconnected');
  });
});

const wssTelemetry = new WebSocketServer({ noServer: true });
wssTelemetry.on('connection', (ws) => {
  console.log('[WS] telemetry client connected');
  ws.on('close', () => {
    console.log('[WS] telemetry client disconnected');
  });
});

EventEmitter.on('new-alarm', (alarm) => {
  wssAlarm.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({
        type: 'alarm',
        data: alarm,
        timestamp: Date.now()
      }));
    }
  });
});

EventEmitter.on('telemetry-update', (data) => {
  wssTelemetry.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({
        type: 'telemetry',
        data: data,
        timestamp: Date.now()
      }));
    }
  });
});

EventEmitter.on('video-frame', (data) => {
  wssVideo.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
});

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/ws/video') {
    wssVideo.handleUpgrade(req, socket, head, (ws) => wssVideo.emit('connection', ws, req));
  } else if (pathname === '/ws/alarm') {
    wssAlarm.handleUpgrade(req, socket, head, (ws) => wssAlarm.emit('connection', ws, req));
  } else if (pathname.startsWith('/api/drones/') && pathname.endsWith('/telemetry')) {
    wssTelemetry.handleUpgrade(req, socket, head, (ws) => wssTelemetry.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

DataStore.initSeed();

server.listen(PORT, () => {
  console.log('Server running at http://localhost:3000');
  console.log('[DataStore] 数据存储已初始化，使用文件系统持久化存储');
  console.log('[WebSocket] 视频、告警、遥测通道已就绪');
});

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down...`);
  // 清理 DJI Adapter 定时器，避免 PM2 reload 时泄漏
  if (DJIAPI && typeof DJIAPI.cleanupTimers === 'function') {
    DJIAPI.cleanupTimers();
  }
  wssVideo.clients.forEach((c) => c.close());
  wssAlarm.clients.forEach((c) => c.close());
  wssTelemetry.clients.forEach((c) => c.close());
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server };