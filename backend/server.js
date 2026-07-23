require('dotenv').config();

process.env.ULTRALYTICS_SETTINGS = 'e:\\无人机智能巡检系统\\ultralytics_settings.yaml';
process.env.HOME = 'e:\\无人机智能巡检系统';

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const { logger } = require('./middleware/logger');
const { requireAuth } = require('./middleware/auth');
const DataStore = require('./data/dataStore');
const EventEmitter = require('./utils/eventEmitter');

const { dronesRouter, geoFencesRouter } = require('./routes/drones');
const aiRouter = require('./routes/ai');
const { plansRouter, workOrdersRouter, alarmsRouter } = require('./routes/business');
const { authRouter, auditLogsRouter } = require('./routes/ops');
const metaRouter = require('./routes/meta');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRouter);

app.use(requireAuth);

app.use('/api/drones', dronesRouter);
app.use('/api/geo-fences', geoFencesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/inspection-plans', plansRouter);
app.use('/api/work-orders', workOrdersRouter);
app.use('/api/alarms', alarmsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/meta', metaRouter);

const frontendIndex = path.join(__dirname, '../frontend/index.html');
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(frontendIndex, (err) => {
    if (err) {
      res.status(404).send('Frontend index.html not found.');
    }
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    code: -1,
    msg: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    data: null
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
  wssVideo.clients.forEach((c) => c.close());
  wssAlarm.clients.forEach((c) => c.close());
  wssTelemetry.clients.forEach((c) => c.close());
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server };