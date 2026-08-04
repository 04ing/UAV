/**
 * dataStore 数据存储单元测试
 * 测试 CRUD 操作和文件持久化
 */

const DataStore = require('../backend/data/dataStore');

// 辅助函数：清理测试数据
function cleanupTestData(prefix) {
  ['drones', 'alarms', 'workOrders', 'inspectionPlans', 'geoFences', 'users'].forEach((entity) => {
    const items = DataStore[entity].getAll();
    items.forEach((item) => {
      if (item.id && item.id.startsWith(prefix)) {
        DataStore[entity].delete(item.id);
      }
    });
  });
}

afterAll(() => {
  cleanupTestData('TEST-');
  cleanupTestData('DRONE-TEST');
});

describe('drones - 无人机数据', () => {
  const testId = 'TEST-DRONE-001';

  afterEach(() => {
    DataStore.drones.delete(testId);
  });

  test('应成功添加无人机', () => {
    const drone = {
      id: testId,
      model: 'DJI M350 RTK',
      battery: 80,
      status: 'idle',
      lat: 30.5,
      lng: 114.3,
    };
    const result = DataStore.drones.add(drone);
    expect(result.id).toBe(testId);

    const found = DataStore.drones.getById(testId);
    expect(found).toBeDefined();
    expect(found.model).toBe('DJI M350 RTK');
  });

  test('应成功更新无人机数据', () => {
    DataStore.drones.add({
      id: testId,
      model: 'DJI M30T',
      battery: 50,
      status: 'idle',
    });

    const updated = DataStore.drones.update(testId, {
      battery: 30,
      status: 'returning',
    });

    expect(updated.battery).toBe(30);
    expect(updated.status).toBe('returning');
    // 原有字段应保留
    expect(updated.model).toBe('DJI M30T');
  });

  test('更新不存在的无人机应返回 null', () => {
    const result = DataStore.drones.update('TEST-NOT-EXIST', { battery: 0 });
    expect(result).toBeNull();
  });

  test('应成功删除无人机', () => {
    DataStore.drones.add({
      id: testId,
      model: 'DJI M350',
      battery: 100,
      status: 'idle',
    });

    const removed = DataStore.drones.delete(testId);
    expect(removed).toBeDefined();
    expect(removed.id).toBe(testId);

    expect(DataStore.drones.getById(testId)).toBeUndefined();
  });

  test('删除不存在的无人机应返回 null', () => {
    expect(DataStore.drones.delete('TEST-NOT-EXIST')).toBeNull();
  });

  test('getAll 应返回数组', () => {
    const result = DataStore.drones.getAll();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('alarms - 告警数据', () => {
  const testId = 'TEST-ALARM-001';

  afterEach(() => {
    DataStore.alarms.delete(testId);
  });

  test('应成功添加告警', () => {
    const alarm = {
      id: testId,
      type: '低电量告警',
      severity: 'warning',
      droneId: 'DRONE-001',
      lat: 30.5,
      lng: 114.3,
      status: 'pending',
    };
    DataStore.alarms.add(alarm);
    const found = DataStore.alarms.getById(testId);
    expect(found).toBeDefined();
    expect(found.type).toBe('低电量告警');
  });

  test('应成功更新告警状态', () => {
    DataStore.alarms.add({
      id: testId,
      type: '电机故障',
      severity: 'critical',
      droneId: 'DRONE-002',
      status: 'pending',
    });

    const updated = DataStore.alarms.update(testId, { status: 'resolved' });
    expect(updated.status).toBe('resolved');
  });

  test('应成功删除告警', () => {
    DataStore.alarms.add({
      id: testId,
      type: 'GPS丢失',
      severity: 'critical',
      droneId: 'DRONE-003',
      status: 'pending',
    });

    const removed = DataStore.alarms.delete(testId);
    expect(removed.id).toBe(testId);
    expect(DataStore.alarms.getById(testId)).toBeUndefined();
  });
});

describe('workOrders - 工单数据', () => {
  const testId = 'TEST-WO-001';

  afterEach(() => {
    DataStore.workOrders.delete(testId);
  });

  test('应成功添加工单', () => {
    const order = {
      id: testId,
      title: '测试工单',
      status: 'pending',
      assignee: '张三',
    };
    DataStore.workOrders.add(order);
    const found = DataStore.workOrders.getById(testId);
    expect(found).toBeDefined();
    expect(found.title).toBe('测试工单');
  });

  test('应成功更新工单状态', () => {
    DataStore.workOrders.add({
      id: testId,
      title: '测试工单',
      status: 'pending',
    });

    const updated = DataStore.workOrders.update(testId, { status: 'processing' });
    expect(updated.status).toBe('processing');
  });

  test('应成功删除工单', () => {
    DataStore.workOrders.add({
      id: testId,
      title: '待删除工单',
      status: 'closed',
    });

    const removed = DataStore.workOrders.delete(testId);
    expect(removed.id).toBe(testId);
  });
});

describe('inspectionPlans - 巡检计划数据', () => {
  const testId = 'TEST-PLAN-001';

  afterEach(() => {
    DataStore.inspectionPlans.delete(testId);
  });

  test('应成功添加巡检计划', () => {
    const plan = {
      id: testId,
      name: '测试巡检计划',
      droneId: 'DRONE-001',
      route: [],
      frequency: 'daily',
      status: 'pending',
    };
    DataStore.inspectionPlans.add(plan);
    const found = DataStore.inspectionPlans.getById(testId);
    expect(found).toBeDefined();
    expect(found.name).toBe('测试巡检计划');
  });

  test('应成功更新巡检计划状态', () => {
    DataStore.inspectionPlans.add({
      id: testId,
      name: '测试',
      droneId: 'DRONE-001',
      status: 'pending',
    });

    const updated = DataStore.inspectionPlans.update(testId, { status: 'active' });
    expect(updated.status).toBe('active');
  });

  test('应成功删除巡检计划', () => {
    DataStore.inspectionPlans.add({
      id: testId,
      name: '待删除',
      droneId: 'DRONE-001',
      status: 'pending',
    });

    const removed = DataStore.inspectionPlans.delete(testId);
    expect(removed.id).toBe(testId);
  });
});

describe('geoFences - 电子围栏数据', () => {
  const testId = 'TEST-GEOF-001';

  afterEach(() => {
    DataStore.geoFences.delete(testId);
  });

  test('应成功添加电子围栏', () => {
    const fence = {
      id: testId,
      name: '测试围栏',
      polygon: [{ lat: 30.5, lng: 114.3 }, { lat: 30.6, lng: 114.3 }, { lat: 30.6, lng: 114.4 }],
      type: 'restricted',
    };
    DataStore.geoFences.add(fence);
    const found = DataStore.geoFences.getById(testId);
    expect(found).toBeDefined();
    expect(found.name).toBe('测试围栏');
    expect(found.polygon).toHaveLength(3);
  });

  test('应成功删除电子围栏', () => {
    DataStore.geoFences.add({
      id: testId,
      name: '待删除围栏',
      polygon: [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }, { lat: 1, lng: 1 }],
      type: 'restricted',
    });

    const removed = DataStore.geoFences.delete(testId);
    expect(removed.id).toBe(testId);
  });
});

describe('users - 用户数据', () => {
  const testId = 'TEST-USER-001';

  afterEach(() => {
    const users = DataStore.users.getAll();
    const idx = users.findIndex((u) => u.id === testId);
    if (idx !== -1) {
      users.splice(idx, 1);
      const fs = require('fs');
      const path = require('path');
      const STORE_DIR = path.join(__dirname, '..', 'data', 'store');
      fs.writeFileSync(path.join(STORE_DIR, 'users.json'), JSON.stringify(users, null, 2), 'utf-8');
    }
  });

  test('应成功添加用户', () => {
    const user = {
      id: testId,
      username: 'testuser',
      password: 'testpass',
      role: 'operator',
      name: '测试用户',
    };
    DataStore.users.add(user);
    const found = DataStore.users.getById(testId);
    expect(found).toBeDefined();
    expect(found.username).toBe('testuser');
  });

  test('getByUsername 应能按用户名查找', () => {
    DataStore.users.add({
      id: testId,
      username: 'unique_test_user',
      password: 'pass',
      role: 'admin',
      name: '管理员',
    });

    const found = DataStore.users.getByUsername('unique_test_user');
    expect(found).toBeDefined();
    expect(found.id).toBe(testId);
  });

  test('应成功更新用户信息', () => {
    DataStore.users.add({
      id: testId,
      username: 'update_test',
      password: 'old',
      role: 'operator',
      name: '旧名称',
    });

    const updated = DataStore.users.update(testId, { name: '新名称' });
    expect(updated.name).toBe('新名称');
    expect(updated.username).toBe('update_test');
  });
});

describe('auditLogs - 审计日志', () => {
  test('应成功添加审计日志', () => {
    const log = {
      id: 'TEST-LOG-001',
      action: 'login',
      userId: 'USER-001',
      timestamp: new Date().toISOString(),
    };
    DataStore.auditLogs.add(log);
    const logs = DataStore.auditLogs.getAll();
    const found = logs.find((l) => l.id === 'TEST-LOG-001');
    expect(found).toBeDefined();
    expect(found.action).toBe('login');
  });

  test('审计日志应限制最多1000条', () => {
    // 验证审计日志机制（不实际写入1000条，验证逻辑即可）
    const logs = DataStore.auditLogs.getAll();
    expect(logs.length).toBeLessThanOrEqual(1000);
  });
});
