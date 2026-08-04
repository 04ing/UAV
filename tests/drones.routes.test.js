/**
 * drones 路由单元测试
 * 使用 supertest 测试 HTTP 接口
 */

const express = require('express');
const request = require('supertest');
const { dronesRouter } = require('../backend/routes/drones');
const DataStore = require('../backend/data/dataStore');
const { clearFault, clearCrashAlarmMark, FAULT_TYPES } = require('../backend/utils/djiApiAdapter');

// 创建测试 Express 应用
const app = express();
app.use(express.json());
app.use('/api/drones', dronesRouter);

// 确保测试用无人机存在
const TEST_DRONE_ID = 'DRONE-001';

beforeAll(() => {
  // 确保有测试数据
  const drone = DataStore.drones.getById(TEST_DRONE_ID);
  if (!drone) {
    DataStore.drones.add({
      id: TEST_DRONE_ID,
      model: 'DJI M350 RTK',
      battery: 85,
      signal: '强',
      status: 'idle',
      lat: 30.6012,
      lng: 114.3025,
      altitude: 120,
      speed: 8,
      heading: 45,
    });
  }
});

afterAll(() => {
  clearFault(TEST_DRONE_ID);
  clearCrashAlarmMark(TEST_DRONE_ID);
});

describe('GET /api/drones - 机队列表', () => {
  test('应返回无人机数组', async () => {
    const res = await request(app).get('/api/drones');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('GET /api/drones/:id - 无人机详情', () => {
  test('应返回存在的无人机详情', async () => {
    const res = await request(app).get(`/api/drones/${TEST_DRONE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(TEST_DRONE_ID);
  });

  test('不存在的无人机应返回 404', async () => {
    const res = await request(app).get('/api/drones/DRONE-NOT-EXIST');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
    expect(res.body.msg).toContain('未找到');
  });
});

describe('POST /api/drones/:id/telemetry - 更新遥测数据', () => {
  test('应成功更新遥测数据', async () => {
    const res = await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
      .send({
        lat: 30.6,
        lng: 114.3,
        battery: 70,
        altitude: 100,
        speed: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.lat).toBe(30.6);
    expect(res.body.data.battery).toBe(70);
  });

  test('缺少 lat/lng 应返回 400', async () => {
    const res = await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/telemetry`)
      .send({ battery: 50 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
    expect(res.body.msg).toContain('lat 和 lng 必填');
  });

  test('不存在的无人机应返回 404', async () => {
    const res = await request(app)
      .post('/api/drones/DRONE-NOT-EXIST/telemetry')
      .send({ lat: 30, lng: 114 });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/drones/:id/return-home - 一键返航', () => {
  test('应成功发送返航指令', async () => {
    const res = await request(app).post(`/api/drones/${TEST_DRONE_ID}/return-home`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('returning');
  });

  test('不存在的无人机应返回 404', async () => {
    const res = await request(app).post('/api/drones/DRONE-NOT-EXIST/return-home');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/drones/:id/telemetry - 获取遥测数据', () => {
  test('应返回遥测数据', async () => {
    const res = await request(app).get(`/api/drones/${TEST_DRONE_ID}/telemetry`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.droneId).toBe(TEST_DRONE_ID);
    expect(res.body.data.lat).toBeDefined();
    expect(res.body.data.battery).toBeDefined();
  });

  test('不存在的无人机应返回 404', async () => {
    const res = await request(app).get('/api/drones/DRONE-NOT-EXIST/telemetry');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/drones/:id/health - 健康诊断', () => {
  test('应返回健康诊断数据', async () => {
    const res = await request(app).get(`/api/drones/${TEST_DRONE_ID}/health`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.droneId).toBe(TEST_DRONE_ID);
    expect(res.body.data.overall).toBeDefined();
    expect(res.body.data.components).toBeDefined();
  });

  test('不存在的无人机应返回 404', async () => {
    const res = await request(app).get('/api/drones/DRONE-NOT-EXIST/health');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/drones/:id/fault - 故障注入', () => {
  afterEach(() => {
    clearFault(TEST_DRONE_ID);
  });

  test('应成功触发电机故障', async () => {
    const res = await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/fault`)
      .send({ faultType: FAULT_TYPES.MOTOR_FAILURE });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.drone.status).toBe('returning');
  });

  test('应成功触发低电量故障', async () => {
    const res = await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/fault`)
      .send({ faultType: FAULT_TYPES.LOW_BATTERY });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  test('缺少 faultType 应返回 400', async () => {
    const res = await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/fault`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.msg).toContain('faultType 必填');
  });

  test('无效的故障类型应返回 400', async () => {
    const res = await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/fault`)
      .send({ faultType: 'invalid_type' });

    expect(res.status).toBe(400);
    expect(res.body.msg).toContain('无效的故障类型');
  });
});

describe('GET /api/drones/:id/fault - 查询故障状态', () => {
  afterEach(() => {
    clearFault(TEST_DRONE_ID);
  });

  test('无故障时应返回正常状态', async () => {
    clearFault(TEST_DRONE_ID);
    const res = await request(app).get(`/api/drones/${TEST_DRONE_ID}/fault`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.fault).toBeNull();
    expect(res.body.data.status).toBe('normal');
  });

  test('有故障时应返回故障信息', async () => {
    await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/fault`)
      .send({ faultType: FAULT_TYPES.GPS_LOST });

    const res = await request(app).get(`/api/drones/${TEST_DRONE_ID}/fault`);
    expect(res.status).toBe(200);
    expect(res.body.data.fault).not.toBeNull();
    expect(res.body.data.fault.type).toBe('gps_lost');
    expect(res.body.data.status).toBe('fault');
    expect(res.body.data.fault.remainingTime).toBeGreaterThan(0);
  });
});

describe('DELETE /api/drones/:id/fault - 清除故障', () => {
  test('应成功清除故障状态', async () => {
    // 先触发故障
    await request(app)
      .post(`/api/drones/${TEST_DRONE_ID}/fault`)
      .send({ faultType: FAULT_TYPES.MOTOR_FAILURE });

    // 清除故障
    const res = await request(app).delete(`/api/drones/${TEST_DRONE_ID}/fault`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.cleared).toBe(true);
    expect(res.body.data.emergencyCleared).toBe(true);
    expect(res.body.data.previousFault).toBeDefined();
  });

  test('无故障时清除应返回提示', async () => {
    clearFault(TEST_DRONE_ID);
    const res = await request(app).delete(`/api/drones/${TEST_DRONE_ID}/fault`);
    expect(res.status).toBe(200);
    expect(res.body.data.fault).toBeNull();
  });
});

describe('GET /api/drones/fault-types/list - 故障类型列表', () => {
  test('应返回5种故障类型', async () => {
    const res = await request(app).get('/api/drones/fault-types/list');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveLength(5);

    const types = res.body.data.map((t) => t.value);
    expect(types).toContain('motor_failure');
    expect(types).toContain('low_battery');
    expect(types).toContain('gps_lost');
    expect(types).toContain('signal_lost');
    expect(types).toContain('obstacle');
  });
});
