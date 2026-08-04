/**
 * djiApiAdapter 故障模拟引擎单元测试
 */

const djiAdapter = require('../backend/utils/djiApiAdapter');
const DataStore = require('../backend/data/dataStore');
const EventEmitter = require('../backend/utils/eventEmitter');

const {
  FAULT_TYPES,
  triggerFault,
  clearFault,
  getFaultState,
  generateCrashAlarm,
  clearCrashAlarmMark,
} = djiAdapter;

// 记录事件
let alarmEvents = [];
let crashEvents = [];

beforeAll(() => {
  EventEmitter.on('new-alarm', (alarm) => alarmEvents.push(alarm));
  EventEmitter.on('crash-alarm', (alarm) => crashEvents.push(alarm));
});

beforeEach(() => {
  alarmEvents = [];
  crashEvents = [];
  // 清除所有故障状态
  Object.values(FAULT_TYPES).forEach((type) => {
    // 清除每个无人机的故障
    const drones = DataStore.drones.getAll();
    drones.forEach((d) => {
      clearFault(d.id);
      clearCrashAlarmMark(d.id);
    });
  });
});

afterAll(() => {
  // 清理测试数据
  const drones = DataStore.drones.getAll();
  drones.forEach((d) => {
    clearFault(d.id);
    clearCrashAlarmMark(d.id);
  });
});

describe('FAULT_TYPES 常量', () => {
  test('应包含5种故障类型', () => {
    expect(Object.keys(FAULT_TYPES)).toHaveLength(5);
  });

  test('故障类型值正确', () => {
    expect(FAULT_TYPES.MOTOR_FAILURE).toBe('motor_failure');
    expect(FAULT_TYPES.LOW_BATTERY).toBe('low_battery');
    expect(FAULT_TYPES.GPS_LOST).toBe('gps_lost');
    expect(FAULT_TYPES.SIGNAL_LOST).toBe('signal_lost');
    expect(FAULT_TYPES.OBSTACLE).toBe('obstacle');
  });
});

describe('triggerFault - 触发故障', () => {
  test('应成功触发电机故障', () => {
    const result = triggerFault('DRONE-001', FAULT_TYPES.MOTOR_FAILURE);
    expect(result.success).toBe(true);
    expect(result.drone.id).toBe('DRONE-001');
    expect(result.drone.status).toBe('returning');
  });

  test('应成功触发低电量故障', () => {
    const result = triggerFault('DRONE-001', FAULT_TYPES.LOW_BATTERY);
    expect(result.success).toBe(true);
  });

  test('应成功触发GPS丢失故障', () => {
    const result = triggerFault('DRONE-002', FAULT_TYPES.GPS_LOST);
    expect(result.success).toBe(true);
    expect(result.drone.status).toBe('returning');
  });

  test('对不存在的无人机应返回失败', () => {
    const result = triggerFault('DRONE-999', FAULT_TYPES.MOTOR_FAILURE);
    expect(result.success).toBe(false);
    expect(result.message).toContain('未找到无人机');
  });

  test('对无效的故障类型应返回失败', () => {
    const result = triggerFault('DRONE-001', 'invalid_fault');
    expect(result.success).toBe(false);
    expect(result.message).toContain('无效的故障类型');
  });

  test('触发后应能查到故障状态', () => {
    triggerFault('DRONE-003', FAULT_TYPES.SIGNAL_LOST);
    const fault = getFaultState('DRONE-003');
    expect(fault).not.toBeNull();
    expect(fault.type).toBe('signal_lost');
    expect(fault.duration).toBe(30000);
  });
});

describe('getFaultState - 查询故障状态', () => {
  test('无故障时应返回 null', () => {
    clearFault('DRONE-001');
    const fault = getFaultState('DRONE-001');
    expect(fault).toBeNull();
  });

  test('有故障时应返回故障信息', () => {
    triggerFault('DRONE-004', FAULT_TYPES.OBSTACLE);
    const fault = getFaultState('DRONE-004');
    expect(fault).not.toBeNull();
    expect(fault.type).toBe('obstacle');
    expect(fault.triggeredAt).toBeDefined();
    expect(fault.duration).toBe(30000);
  });
});

describe('clearFault - 清除故障', () => {
  test('清除后故障状态应为 null', () => {
    triggerFault('DRONE-005', FAULT_TYPES.LOW_BATTERY);
    expect(getFaultState('DRONE-005')).not.toBeNull();

    clearFault('DRONE-005');
    expect(getFaultState('DRONE-005')).toBeNull();
  });

  test('清除故障时也应清除坠毁告警标记', () => {
    // 先生成坠毁告警
    const drone = {
      id: 'DRONE-005',
      lat: 30.598,
      lng: 114.305,
      altitude: 50,
    };
    generateCrashAlarm(drone);

    // 清除故障
    clearFault('DRONE-005');

    // 再次生成应成功（标记已清除）
    const beforeCount = DataStore.alarms.getAll().filter(a => a.droneId === 'DRONE-005' && a.emergency).length;
    generateCrashAlarm(drone);
    const afterCount = DataStore.alarms.getAll().filter(a => a.droneId === 'DRONE-005' && a.emergency).length;
    expect(afterCount).toBe(beforeCount + 1);
  });
});

describe('generateCrashAlarm - 坠毁告警生成', () => {
  test('应成功生成 critical 级紧急告警', () => {
    const drone = {
      id: 'DRONE-TEST-CRASH-1',
      lat: 30.123,
      lng: 114.456,
      altitude: 25,
    };

    generateCrashAlarm(drone);

    const alarms = DataStore.alarms.getAll();
    const crashAlarm = alarms.find(
      (a) => a.droneId === 'DRONE-TEST-CRASH-1' && a.emergency === true
    );

    expect(crashAlarm).toBeDefined();
    expect(crashAlarm.severity).toBe('critical');
    expect(crashAlarm.type).toBe('无人机失联');
    expect(crashAlarm.lastKnownPosition).toEqual({
      lat: 30.123,
      lng: 114.456,
      altitude: 25,
    });
    expect(crashAlarm.description).toContain('紧急');
    expect(crashAlarm.description).toContain('救援');
  });

  test('应通过 EventEmitter 推送 new-alarm 和 crash-alarm 事件', () => {
    const drone = {
      id: 'DRONE-TEST-CRASH-2',
      lat: 30.999,
      lng: 114.111,
      altitude: 10,
    };

    generateCrashAlarm(drone);

    expect(alarmEvents.length).toBeGreaterThanOrEqual(1);
    expect(crashEvents.length).toBeGreaterThanOrEqual(1);

    const lastAlarm = alarmEvents[alarmEvents.length - 1];
    expect(lastAlarm.droneId).toBe('DRONE-TEST-CRASH-2');
    expect(lastAlarm.emergency).toBe(true);
  });

  test('重复调用应被去重（不生成第二个告警）', () => {
    const drone = {
      id: 'DRONE-TEST-CRASH-3',
      lat: 30.555,
      lng: 114.222,
      altitude: 30,
    };

    generateCrashAlarm(drone);
    const countAfterFirst = DataStore.alarms.getAll().filter(
      (a) => a.droneId === 'DRONE-TEST-CRASH-3' && a.emergency
    ).length;

    generateCrashAlarm(drone); // 应被跳过
    const countAfterSecond = DataStore.alarms.getAll().filter(
      (a) => a.droneId === 'DRONE-TEST-CRASH-3' && a.emergency
    ).length;

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  test('清除标记后可再次生成告警', () => {
    const drone = {
      id: 'DRONE-TEST-CRASH-4',
      lat: 30.444,
      lng: 114.333,
      altitude: 15,
    };

    generateCrashAlarm(drone);
    const count1 = DataStore.alarms.getAll().filter(
      (a) => a.droneId === 'DRONE-TEST-CRASH-4' && a.emergency
    ).length;

    clearCrashAlarmMark('DRONE-TEST-CRASH-4');

    generateCrashAlarm(drone);
    const count2 = DataStore.alarms.getAll().filter(
      (a) => a.droneId === 'DRONE-TEST-CRASH-4' && a.emergency
    ).length;

    expect(count2).toBe(count1 + 1);
  });
});

describe('clearCrashAlarmMark - 清除坠毁标记', () => {
  test('存在标记时返回 true', () => {
    const drone = {
      id: 'DRONE-TEST-MARK-1',
      lat: 30.1,
      lng: 114.2,
      altitude: 5,
    };
    generateCrashAlarm(drone);
    expect(clearCrashAlarmMark('DRONE-TEST-MARK-1')).toBe(true);
  });

  test('不存在标记时返回 false', () => {
    expect(clearCrashAlarmMark('DRONE-NO-MARK')).toBe(false);
  });
});
