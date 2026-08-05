/**
 * 无人机数据上报 → 自动返航 全流程集成测试
 *
 * 测试链路:
 *   1. JWT 登录获取 Token
 *   2. 健康探针
 *   3. 注册无人机
 *   4. 正常遥测上报（inspecting 状态，电量充足）
 *   5. 低电量遥测上报 → 系统自动切换 returning
 *   6. 低电量告警上传 → 告警入库
 *   7. 持续返航遥测上报（returning 状态）
 *   8. 电量耗尽遥测上报 → 系统切换 offline
 *   9. 紧急告警上传 → critical 告警入库
 *  10. 查询告警列表 → 验证告警已入库且可过滤
 *  11. 一键返航接口
 *  12. 故障注入（gps_lost）→ 自动返航
 *  13. 故障查询 → 验证故障状态
 *  14. 故障清除 → 验证恢复
 *  15. 参数校验（缺 lat/lng → 400, 不存在的无人机 → 404）
 *  16. 路径遍历防护 → 403
 *  17. 最终状态验证
 */

const express = require('express');
const request = require('supertest');
const DataStore = require('../backend/data/dataStore');
const { signToken } = require('../backend/middleware/auth');
const { clearFault, clearCrashAlarmMark, triggerFault, FAULT_TYPES } = require('../backend/utils/djiApiAdapter');

// ============ 构建带完整中间件的测试 App ============
// 与真实 server.js 一致：helmet + 限流 + 路径遍历防护 + auth + 所有路由
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');

const { dronesRouter, geoFencesRouter } = require('../backend/routes/drones');
const aiRouter = require('../backend/routes/ai');
const { plansRouter, workOrdersRouter, alarmsRouter } = require('../backend/routes/business');
const { authRouter, auditLogsRouter } = require('../backend/routes/ops');
const metaRouter = require('../backend/routes/meta');
const { logger } = require('../backend/middleware/logger');
const { requireAuth } = require('../backend/middleware/auth');

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use((req, res, next) => {
  const decoded = decodeURIComponent(req.path);
  if (decoded.includes('../') || decoded.includes('..\\') || /%2e%2e/i.test(req.url)) {
    return res.status(403).json({ code: -1, msg: '请求路径不合法', data: null });
  }
  next();
});
// 测试中放宽限流避免误触发
app.use(rateLimit({ windowMs: 1000, max: 10000, standardHeaders: true, legacyHeaders: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 静默日志
app.use((req, res, next) => next());

app.use('/api/auth', authRouter);
app.use('/api/meta', metaRouter);
app.use(requireAuth);
app.use('/api/drones', dronesRouter);
app.use('/api/geo-fences', geoFencesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/inspection-plans', plansRouter);
app.use('/api/work-orders', workOrdersRouter);
app.use('/api/alarms', alarmsRouter);
app.use('/api/audit-logs', auditLogsRouter);

// ============ 测试常量 ============
const TEST_DRONE_ID = 'DRONE-INTEG-001';
const TEST_ROUTE = [
  { lat: 30.5980, lng: 114.3050, alt: 120 },
  { lat: 30.5990, lng: 114.3060, alt: 130 },
  { lat: 30.6000, lng: 114.3070, alt: 140 },
  { lat: 30.6010, lng: 114.3080, alt: 140 },
  { lat: 30.5980, lng: 114.3050, alt: 120 },
];

let token;

// ============ 前置/后置 ============
beforeAll(() => {
  // 生成 JWT Token
  token = signToken({ id: 'USER-TEST', username: 'admin', role: 'admin' });

  // 注册测试无人机
  DataStore.drones.add({
    id: TEST_DRONE_ID,
    model: 'DJI M350 RTK (集成测试)',
    battery: 100,
    signal: '强',
    status: 'idle',
    lat: TEST_ROUTE[0].lat,
    lng: TEST_ROUTE[0].lng,
    altitude: 0,
    speed: 0,
    heading: 0,
  });
});

afterAll(() => {
  // 清理故障状态
  clearFault(TEST_DRONE_ID);
  clearCrashAlarmMark(TEST_DRONE_ID);
  // 清理测试无人机
  DataStore.drones.delete(TEST_DRONE_ID);
});

// ============ 测试用例 ============

describe('=========== 全流程集成测试：无人机上报 → 自动返航 ===========', () => {

  // ---------- 1. 认证 ----------
  describe('1. JWT 认证', () => {
    test('POST /api/auth/login - 正确密码应返回 Token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.username).toBe('admin');
    });

    test('POST /api/auth/login - 错误密码应返回 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1);
    });

    test('无 Token 访问受保护 API 应返回 401', async () => {
      const res = await request(app).get('/api/drones');
      expect(res.status).toBe(401);
    });
  });

  // ---------- 2. 健康探针 ----------
  describe('2. 健康探针', () => {
    test('GET /api/meta/health - 应返回 healthy', async () => {
      const res = await request(app).get('/api/meta/health');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.timestamp).toBeDefined();
    });
  });

  // ---------- 3. 无人机注册 ----------
  describe('3. 无人机注册', () => {
    test('POST /api/drones/upload - 应成功注册测试无人机', async () => {
      const res = await request(app)
        .post('/api/drones/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({
          drones: [{
            id: TEST_DRONE_ID,
            model: 'DJI M350 RTK (集成测试)',
            battery: 100,
            signal: '强',
            status: 'idle',
            lat: TEST_ROUTE[0].lat,
            lng: TEST_ROUTE[0].lng,
            altitude: 0,
          }],
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------- 4. 正常遥测上报 ----------
  describe('4. 正常遥测上报（电量充足，巡检中）', () => {
    test('POST /:id/telemetry - 电量 80% 应保持 inspecting', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: TEST_ROUTE[0].lat,
          lng: TEST_ROUTE[0].lng,
          battery: 80,
          altitude: 120,
          speed: 10,
          heading: 45,
          status: 'inspecting',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.battery).toBe(80);
      expect(res.body.data.status).toBe('inspecting');
      expect(res.body.data.lat).toBeCloseTo(TEST_ROUTE[0].lat, 5);
      expect(res.body.data.lastUpdate).toBeDefined();
    });

    test('POST /:id/telemetry - 电量 50% 仍应保持 inspecting', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: TEST_ROUTE[1].lat,
          lng: TEST_ROUTE[1].lng,
          battery: 50,
          altitude: 130,
          speed: 12,
          heading: 90,
          status: 'inspecting',
        });

      expect(res.body.data.battery).toBe(50);
      expect(res.body.data.status).toBe('inspecting');
    });
  });

  // ---------- 5. 低电量自动返航 ----------
  describe('5. 低电量自动返航（核心逻辑）', () => {
    test('POST /:id/telemetry - 电量 25% 应自动切换为 returning', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: TEST_ROUTE[2].lat,
          lng: TEST_ROUTE[2].lng,
          battery: 25,
          altitude: 140,
          speed: 8,
          heading: 180,
          status: 'inspecting',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      // 核心断言：系统应自动将 inspecting → returning
      expect(res.body.data.status).toBe('returning');
      expect(res.body.data.battery).toBe(25);
    });

    test('POST /:id/telemetry - 电量 20% 应保持 returning', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: TEST_ROUTE[3].lat,
          lng: TEST_ROUTE[3].lng,
          battery: 20,
          altitude: 135,
          speed: 5,
          heading: 225,
          status: 'inspecting', // 即使客户端传 inspecting，系统应覆盖为 returning
        });

      expect(res.body.data.status).toBe('returning');
      expect(res.body.data.battery).toBe(20);
    });

    test('POST /:id/telemetry - 电量 10% 应保持 returning', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: TEST_ROUTE[4].lat,
          lng: TEST_ROUTE[4].lng,
          battery: 10,
          altitude: 125,
          speed: 5,
          heading: 270,
          status: 'returning',
        });

      expect(res.body.data.status).toBe('returning');
    });
  });

  // ---------- 6. 低电量告警上传 ----------
  describe('6. 低电量告警上传', () => {
    test('POST /api/alarms/upload - 应成功上传低电量告警', async () => {
      const res = await request(app)
        .post('/api/alarms/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({
          alarms: [{
            type: '低电量告警',
            severity: 'warning',
            droneId: TEST_DRONE_ID,
            lat: TEST_ROUTE[2].lat,
            lng: TEST_ROUTE[2].lng,
            description: '电量低于25%，已触发自动返航',
          }],
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.uploaded.length).toBe(1);
    });
  });

  // ---------- 7. 电量耗尽 → 离线 ----------
  describe('7. 电量耗尽 → 离线', () => {
    test('POST /:id/telemetry - 电量 0% 应自动切换为 offline', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: TEST_ROUTE[4].lat,
          lng: TEST_ROUTE[4].lng,
          battery: 0,
          altitude: 100,
          speed: 0,
          heading: 315,
          status: 'returning',
        });

      expect(res.status).toBe(200);
      // 核心断言：电量耗尽 → offline
      expect(res.body.data.status).toBe('offline');
      expect(res.body.data.battery).toBe(0);
      expect(res.body.data.speed).toBe(0);
    });
  });

  // ---------- 8. 紧急告警上传 ----------
  describe('8. 紧急告警上传', () => {
    test('POST /api/alarms/upload - 应成功上传 critical 紧急告警', async () => {
      const res = await request(app)
        .post('/api/alarms/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({
          alarms: [{
            type: '无人机失联',
            severity: 'critical',
            droneId: TEST_DRONE_ID,
            lat: TEST_ROUTE[4].lat,
            lng: TEST_ROUTE[4].lng,
            description: '电量耗尽坠毁，最后位置已记录',
          }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.uploaded.length).toBe(1);
    });
  });

  // ---------- 9. 告警查询与过滤 ----------
  describe('9. 告警查询与过滤', () => {
    test('GET /api/alarms?droneId= - 应返回该无人机的所有告警', async () => {
      const res = await request(app)
        .get(`/api/alarms?droneId=${TEST_DRONE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const types = res.body.data.map((a) => a.type);
      expect(types).toContain('低电量告警');
      expect(types).toContain('无人机失联');
    });

    test('GET /api/alarms?severity=critical - 应只返回 critical 告警', async () => {
      const res = await request(app)
        .get(`/api/alarms?severity=critical&droneId=${TEST_DRONE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.every((a) => a.severity === 'critical')).toBe(true);
    });

    test('GET /api/alarms?severity=warning - 应只返回 warning 告警', async () => {
      const res = await request(app)
        .get(`/api/alarms?severity=warning&droneId=${TEST_DRONE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.every((a) => a.severity === 'warning')).toBe(true);
    });
  });

  // ---------- 10. 一键返航 ----------
  describe('10. 一键返航接口', () => {
    test('POST /:id/return-home - 应成功发送返航指令', async () => {
      // 先恢复无人机为在线状态
      DataStore.drones.update(TEST_DRONE_ID, { status: 'inspecting', battery: 30 });

      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/return-home`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('returning');
    });

    test('POST /:id/return-home - 不存在的无人机应返回 404', async () => {
      const res = await request(app)
        .post('/api/drones/DRONE-NOT-EXIST/return-home')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ---------- 11. 故障注入 ----------
  describe('11. 故障注入与自动返航', () => {
    test('POST /:id/fault - 触发 gps_lost 应自动返航', async () => {
      // 确保无人机在巡检状态
      DataStore.drones.update(TEST_DRONE_ID, { status: 'inspecting', battery: 60 });

      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/fault`)
        .set('Authorization', `Bearer ${token}`)
        .send({ faultType: 'gps_lost' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.drone.status).toBe('returning');
    });

    test('GET /:id/fault - 应返回当前故障状态', async () => {
      const res = await request(app)
        .get(`/api/drones/${TEST_DRONE_ID}/fault`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.fault).toBeTruthy();
      expect(res.body.data.fault.type).toBe('gps_lost');
    });

    test('DELETE /:id/fault - 应清除故障并恢复正常', async () => {
      const res = await request(app)
        .delete(`/api/drones/${TEST_DRONE_ID}/fault`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      // 验证故障已清除
      const faultRes = await request(app)
        .get(`/api/drones/${TEST_DRONE_ID}/fault`)
        .set('Authorization', `Bearer ${token}`);

      expect(faultRes.body.data.fault).toBeNull();
    });
  });

  // ---------- 12. 参数校验 ----------
  describe('12. 参数校验与错误处理', () => {
    test('POST /:id/telemetry - 缺少 lat 应返回 400', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lng: 114.305, battery: 80 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    test('POST /:id/telemetry - 缺少 lng 应返回 400', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lat: 30.598, battery: 80 });

      expect(res.status).toBe(400);
    });

    test('POST /:id/telemetry - 不存在的无人机应返回 404', async () => {
      const res = await request(app)
        .post('/api/drones/DRONE-NOPE/telemetry')
        .set('Authorization', `Bearer ${token}`)
        .send({ lat: 30.598, lng: 114.305 });

      expect(res.status).toBe(404);
    });

    test('POST /:id/fault - 无效故障类型应返回 400', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/fault`)
        .set('Authorization', `Bearer ${token}`)
        .send({ faultType: 'invalid_fault' });

      expect(res.status).toBe(400);
    });

    test('POST /:id/fault - 缺少 faultType 应返回 400', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/fault`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    test('POST /api/alarms/upload - 空数组应返回 400', async () => {
      const res = await request(app)
        .post('/api/alarms/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ alarms: [] });

      expect(res.status).toBe(400);
    });

    test('POST /api/alarms/upload - 非数组应返回 400', async () => {
      const res = await request(app)
        .post('/api/alarms/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ alarms: 'not-an-array' });

      expect(res.status).toBe(400);
    });
  });

  // ---------- 13. 安全防护 ----------
  describe('13. 安全防护', () => {
    test('路径遍历 ../ 应返回 403', async () => {
      const res = await request(app)
        .get('/api/..%2F..%2Fetc%2Fpasswd')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    test('无 Token 访问遥测上报应返回 401', async () => {
      const res = await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .send({ lat: 30.598, lng: 114.305 });

      expect(res.status).toBe(401);
    });
  });

  // ---------- 14. 最终状态验证 ----------
  describe('14. 最终状态验证', () => {
    test('GET /api/drones/:id - 应反映最终状态', async () => {
      // 设置最终状态
      DataStore.drones.update(TEST_DRONE_ID, {
        status: 'offline',
        battery: 0,
        lat: TEST_ROUTE[4].lat,
        lng: TEST_ROUTE[4].lng,
      });

      const res = await request(app)
        .get(`/api/drones/${TEST_DRONE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(TEST_DRONE_ID);
      expect(res.body.data.status).toBe('offline');
      expect(res.body.data.battery).toBe(0);
      expect(res.body.data.lastUpdate).toBeDefined();
    });

    test('GET /api/drones/:id/health - 健康诊断应返回结构', async () => {
      const res = await request(app)
        .get(`/api/drones/${TEST_DRONE_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.droneId).toBe(TEST_DRONE_ID);
      expect(res.body.data.overall).toBeDefined();
      expect(res.body.data.components).toBeDefined();
    });
  });

  // ---------- 15. 全流程数据一致性 ----------
  describe('15. 全流程数据一致性', () => {
    test('遥测上报的数据应与查询结果一致', async () => {
      const lat = 30.5995;
      const lng = 114.3055;
      const battery = 45;

      await request(app)
        .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lat, lng, battery, altitude: 130, speed: 8, heading: 99, status: 'inspecting' });

      const res = await request(app)
        .get(`/api/drones/${TEST_DRONE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.lat).toBeCloseTo(lat, 5);
      expect(res.body.data.lng).toBeCloseTo(lng, 5);
      expect(res.body.data.battery).toBe(battery);
      expect(res.body.data.heading).toBe(99);
    });

    test('接口元数据应包含遥测上报接口', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      expect(res.status).toBe(200);
      const endpoints = Array.isArray(res.body.data) ? res.body.data : res.body.data;
      const telemetryEp = endpoints.find(
        (e) => e.method === 'POST' && e.path.includes('/:id/telemetry')
      );
      expect(telemetryEp).toBeTruthy();
      expect(telemetryEp.description).toContain('遥测');
    });
  });
});
