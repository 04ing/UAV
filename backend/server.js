require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const { logger } = require('./middleware/logger');
const { requireAuth } = require('./middleware/auth');
const { getAlarms } = require('./data/mock');
const { isDjiEnabled } = require('./services/dji-cloud');
const djiMqtt = require('./services/dji-mqtt');

const { dronesRouter, geoFencesRouter } = require('./routes/drones');
const aiRouter = require('./routes/ai');
const { plansRouter, workOrdersRouter } = require('./routes/business');
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

const server = http.createServer(app);

const wssVideo = new WebSocketServer({ noServer: true });
wssVideo.on('connection', (ws) => {
  console.log('[WS] video client connected');
  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({
      type: 'video_frame',
      droneId: 'DRONE-001',
      timestamp: Date.now(),
      frameIndex: Math.floor(Math.random() * 100000),
      dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAg='
    }));
  }, 1000);
  ws.on('close', () => clearInterval(interval));
});

const wssAlarm = new WebSocketServer({ noServer: true });
wssAlarm.on('connection', (ws) => {
  console.log('[WS] alarm client connected');
  const alarms = getAlarms();
  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    const alarm = alarms[Math.floor(Math.random() * alarms.length)];
    ws.send(JSON.stringify({
      type: 'alarm',
      data: alarm,
      timestamp: Date.now()
    }));
  }, 1000);
  ws.on('close', () => clearInterval(interval));
});

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/ws/video') {
    wssVideo.handleUpgrade(req, socket, head, (ws) => wssVideo.emit('connection', ws, req));
  } else if (pathname === '/ws/alarm') {
    wssAlarm.handleUpgrade(req, socket, head, (ws) => wssAlarm.emit('connection', ws, req));
  } else if (pathname.startsWith('/api/drones/') && pathname.endsWith('/telemetry')) {
    wssVideo.handleUpgrade(req, socket, head, (ws) => wssVideo.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

async function initDjiServices() {
  if (isDjiEnabled()) {
    console.log('[DJI] DJI Cloud API is enabled, connecting to MQTT...');
    await djiMqtt.connect();
  } else {
    console.log('[DJI] DJI Cloud API is not enabled, using Mock data. Set DJI_CLOUD_ENABLED=true and configure credentials in .env to enable.');
  }
}

server.listen(PORT, async () => {
  console.log('Server running at http://localhost:3000');
  await initDjiServices();
});

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down...`);
  djiMqtt.disconnect();
  wssVideo.clients.forEach((c) => c.close());
  wssAlarm.clients.forEach((c) => c.close());
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server };