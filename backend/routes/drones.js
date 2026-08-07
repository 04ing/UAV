const express = require('express');
const { success, error } = require('../utils/response');
const DataStore = require('../data/dataStore');
const EventEmitter = require('../utils/eventEmitter');
const DJIAPI = require('../utils/djiApiAdapter');
const { triggerFault, clearFault, getFaultState, FAULT_TYPES } = require('../utils/djiApiAdapter');

const dronesRouter = express.Router();

dronesRouter.get('/', async (req, res) => {
  try {
    // 优先从DJI上云API获取数据
    const djiDrones = await DJIAPI.getDrones();
    
    // 同步到本地DataStore
    for (const djiDrone of djiDrones) {
      const existing = DataStore.drones.getById(djiDrone.id);
      const droneData = {
        ...djiDrone,
        lastUpdate: djiDrone.lastUpdate || new Date().toISOString()
      };
      if (existing) {
        DataStore.drones.update(djiDrone.id, droneData);
      } else {
        DataStore.drones.add(droneData);
      }
    }
    
    const drones = DataStore.drones.getAll();
    success(res, drones, '获取机队列表成功');
  } catch (err) {
    console.error('[drones] 获取机队列表失败:', err);
    // 降级到本地数据
    const drones = DataStore.drones.getAll();
    success(res, drones, '获取机队列表成功（本地数据）');
  }
});

dronesRouter.get('/:id', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }
  success(res, device, '获取无人机详情成功');
});

dronesRouter.post('/upload', (req, res) => {
  const { drones } = req.body || {};
  if (!Array.isArray(drones) || drones.length === 0) {
    return error(res, '参数不合法：drones 必须是数组且至少包含一个无人机数据', 400);
  }

  const uploaded = [];
  const updated = [];

  for (const droneData of drones) {
    const { id, model, battery, signal, status, lat, lng, altitude, speed, heading, lastUpdate } = droneData;
    
    if (!id || !model) {
      continue;
    }

    const existing = DataStore.drones.getById(id);
    const drone = {
      id,
      model,
      battery: battery || 0,
      signal: signal || '弱',
      status: status || 'idle',
      lat: lat || 0,
      lng: lng || 0,
      altitude: altitude || 0,
      speed: speed || 0,
      heading: heading || 0,
      lastUpdate: lastUpdate || new Date().toISOString()
    };

    if (existing) {
      DataStore.drones.update(id, drone);
      updated.push(id);
    } else {
      DataStore.drones.add(drone);
      uploaded.push(id);
    }
  }

  success(res, { uploaded, updated, total: uploaded.length + updated.length }, 
    `成功上传 ${uploaded.length} 台新无人机，更新 ${updated.length} 台无人机数据`);
});

dronesRouter.post('/:id/telemetry', (req, res) => {
  const { lat, lng, battery, signal, altitude, speed, heading, status } = req.body || {};

  if (lat === undefined || lng === undefined) {
    return error(res, '参数不合法：lat 和 lng 必填', 400);
  }

  const updates = {
    lat,
    lng,
    lastUpdate: new Date().toISOString()
  };

  if (battery !== undefined) updates.battery = battery;
  if (signal !== undefined) updates.signal = signal;
  if (altitude !== undefined) updates.altitude = altitude;
  if (speed !== undefined) updates.speed = speed;
  if (heading !== undefined) updates.heading = heading;
  if (status !== undefined) updates.status = status;

  // 低电量自动返航逻辑（与 djiApiAdapter.js 的 mock 定时器保持一致）
  if (battery !== undefined) {
    if (battery <= 0) {
      updates.status = 'offline';
      updates.speed = 0;
    } else if (battery <= 25 && (status === 'inspecting' || updates.status === 'inspecting')) {
      updates.status = 'returning';
    }
  }

  const updated = DataStore.drones.update(req.params.id, updates);
  if (!updated) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  EventEmitter.emit('telemetry-update', {
    droneId: req.params.id,
    ...updates
  });

  success(res, updated, '遥测数据更新成功');
});

dronesRouter.post('/:id/return-home', async (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  try {
    // 调用DJI上云API发送返航指令
    await DJIAPI.returnHome(req.params.id);
    
    // 更新本地状态
    DataStore.drones.update(req.params.id, { 
      status: 'returning',
      lastUpdate: new Date().toISOString()
    });

    success(res, { status: 'returning', message: `返航指令已发送至 ${device.id}` }, '返航指令发送成功');
  } catch (err) {
    console.error('[drones] 返航指令发送失败:', err);
    // 降级：仅更新本地状态
    DataStore.drones.update(req.params.id, { 
      status: 'returning',
      lastUpdate: new Date().toISOString()
    });
    success(res, { status: 'returning', message: `返航指令已发送至 ${device.id}（本地模式）` }, '返航指令发送成功（本地模式）');
  }
});

dronesRouter.get('/:id/telemetry', async (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  try {
    // 优先从DJI上云API获取实时遥测数据
    const djiTelemetry = await DJIAPI.getTelemetry(req.params.id);
    if (djiTelemetry) {
      // 同步更新本地数据
      DataStore.drones.update(req.params.id, {
        lat: djiTelemetry.lat,
        lng: djiTelemetry.lng,
        battery: djiTelemetry.battery,
        signal: djiTelemetry.signal,
        altitude: djiTelemetry.altitude,
        speed: djiTelemetry.velocity,
        heading: djiTelemetry.heading,
        status: djiTelemetry.status,
        lastUpdate: new Date().toISOString()
      });
      EventEmitter.emit('telemetry-update', {
        droneId: req.params.id,
        lat: djiTelemetry.lat,
        lng: djiTelemetry.lng,
        battery: djiTelemetry.battery,
        signal: djiTelemetry.signal,
        altitude: djiTelemetry.altitude,
        speed: djiTelemetry.velocity,
        heading: djiTelemetry.heading,
        status: djiTelemetry.status,
        timestamp: Date.now()
      });
      return success(res, djiTelemetry, '获取遥测数据成功');
    }
  } catch (err) {
    console.error('[drones] 获取DJI遥测数据失败:', err.message);
  }

  // 降级到本地数据
  success(res, {
    droneId: device.id,
    timestamp: new Date().toISOString(),
    lat: device.lat,
    lng: device.lng,
    battery: device.battery,
    signal: device.signal,
    altitude: device.altitude || 0,
    velocity: device.speed || 0,
    heading: device.heading || 0,
    status: device.status
  }, '获取遥测数据成功（本地数据）');
});

/* 健康诊断接口 */
dronesRouter.get('/:id/health', async (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  try {
    const health = await DJIAPI.getHealth(req.params.id);
    success(res, health, '获取健康诊断成功');
  } catch (err) {
    console.error('[drones] 获取健康诊断失败:', err);
    // 降级返回基础信息
    success(res, {
      droneId: device.id,
      overall: device.status === 'offline' ? 'error' : device.battery < 20 ? 'warning' : 'good',
      components: {
        battery: { status: device.battery < 20 ? 'warning' : 'good', level: device.battery },
        motors: { status: 'good' },
        gps: { status: 'good' },
        gimbal: { status: 'good' },
        camera: { status: 'good' },
      },
      firmware: { version: 'v4.1.2.3' },
    }, '获取健康诊断成功（本地数据）');
  }
});

/* 任务信息接口 */
dronesRouter.get('/:id/tasks', async (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  try {
    const tasks = await DJIAPI.getTasks(req.params.id);
    success(res, tasks, '获取任务信息成功');
  } catch (err) {
    console.error('[drones] 获取任务信息失败:', err);
    success(res, {
      droneId: device.id,
      currentTask: '无任务',
      taskStatus: 'idle',
      progress: 0,
    }, '获取任务信息成功（本地数据）');
  }
});

/* 故障模拟接口 - 触发故障 */
dronesRouter.post('/:id/fault', (req, res) => {
  const { faultType } = req.body || {};
  const droneId = req.params.id;

  if (!faultType) {
    return error(res, '参数不合法：faultType 必填', 400);
  }

  const validTypes = Object.values(FAULT_TYPES);
  if (!validTypes.includes(faultType)) {
    return error(res, `无效的故障类型: ${faultType}，可选值: ${validTypes.join(', ')}`, 400);
  }

  const result = triggerFault(droneId, faultType);
  if (!result.success) {
    return error(res, result.message, 404);
  }

  success(res, result, `故障模拟触发成功: ${result.message}`);
});

/* 故障模拟接口 - 清除故障 */
dronesRouter.delete('/:id/fault', (req, res) => {
  const droneId = req.params.id;
  const fault = getFaultState(droneId);

  if (!fault) {
    return success(res, { droneId, fault: null }, '该无人机当前无故障');
  }

  // 清除故障状态和坠毁告警标记
  clearFault(droneId);

  // 清除无人机的紧急状态字段
  const drone = DataStore.drones.getById(droneId);
  if (drone) {
    DataStore.drones.update(droneId, {
      emergency: false,
      status: 'idle',  // 恢复为待机状态
      lastUpdate: new Date().toISOString()
    });

    // 推送状态更新
    EventEmitter.emit('telemetry-update', {
      droneId,
      status: 'idle',
      emergency: false
    });
  }

  success(res, { droneId, cleared: true, previousFault: fault, emergencyCleared: true }, '故障已清除，无人机恢复正常');
});

/* 故障模拟接口 - 查询故障状态 */
dronesRouter.get('/:id/fault', (req, res) => {
  const droneId = req.params.id;
  const fault = getFaultState(droneId);

  if (!fault) {
    return success(res, { droneId, fault: null, status: 'normal' }, '无人机状态正常');
  }

  success(res, {
    droneId,
    fault: {
      type: fault.type,
      triggeredAt: new Date(fault.triggeredAt).toISOString(),
      duration: fault.duration,
      remainingTime: Math.max(0, fault.duration - (Date.now() - fault.triggeredAt)),
    },
    status: 'fault',
  }, '无人机存在故障');
});

/* 获取故障类型列表 */
dronesRouter.get('/fault-types/list', (req, res) => {
  const types = Object.entries(FAULT_TYPES).map(([key, value]) => ({
    key,
    value,
    label: key === 'MOTOR_FAILURE' ? '电机故障' :
           key === 'LOW_BATTERY' ? '低电量告警' :
           key === 'GPS_LOST' ? 'GPS信号丢失' :
           key === 'SIGNAL_LOST' ? '遥控信号丢失' : '障碍物检测',
  }));
  success(res, types, '获取故障类型列表成功');
});

/* ========== 飞控高级功能 API ========== */

// 飞行参数存储（内存缓存，可扩展为持久化）
const flightParamsCache = {};

/* 保存飞行参数配置 */
dronesRouter.post('/:id/flight-params', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  const { obstacleAvoidance, terrainFollow, resumeFlight, obstacleDistance, maxAltitude, maxSpeed } = req.body || {};

  const params = {
    droneId: req.params.id,
    obstacleAvoidance: obstacleAvoidance !== undefined ? !!obstacleAvoidance : (flightParamsCache[req.params.id]?.obstacleAvoidance || false),
    terrainFollow: terrainFollow !== undefined ? !!terrainFollow : (flightParamsCache[req.params.id]?.terrainFollow || false),
    resumeFlight: resumeFlight !== undefined ? !!resumeFlight : (flightParamsCache[req.params.id]?.resumeFlight || true),
    obstacleDistance: obstacleDistance !== undefined ? Number(obstacleDistance) : (flightParamsCache[req.params.id]?.obstacleDistance || 20),
    maxAltitude: maxAltitude !== undefined ? Number(maxAltitude) : (flightParamsCache[req.params.id]?.maxAltitude || 120),
    maxSpeed: maxSpeed !== undefined ? Number(maxSpeed) : (flightParamsCache[req.params.id]?.maxSpeed || 15),
    updatedAt: new Date().toISOString()
  };

  flightParamsCache[req.params.id] = params;

  // 同步更新无人机状态
  DataStore.drones.update(req.params.id, {
    flightParams: params,
    lastUpdate: new Date().toISOString()
  });

  // 记录审计日志
  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: (req.user && req.user.username) || 'system',
    action: 'update_flight_params',
    target: req.params.id,
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  success(res, params, '飞行参数保存成功');
});

/* 获取飞行参数配置 */
dronesRouter.get('/:id/flight-params', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  const params = flightParamsCache[req.params.id] || device.flightParams || {
    droneId: req.params.id,
    obstacleAvoidance: false,
    terrainFollow: false,
    resumeFlight: true,
    obstacleDistance: 20,
    maxAltitude: 120,
    maxSpeed: 15
  };

  success(res, params, '获取飞行参数成功');
});

/* 断点续飞 - 保存当前飞行进度 */
dronesRouter.post('/:id/resume-flight/save', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  const { waypointIndex, flightProgress, routeId, lat, lng, altitude } = req.body || {};

  const breakpoint = {
    droneId: req.params.id,
    waypointIndex: waypointIndex || 0,
    flightProgress: flightProgress || 0,
    routeId: routeId || null,
    lat: lat || device.lat,
    lng: lng || device.lng,
    altitude: altitude || device.altitude,
    savedAt: new Date().toISOString()
  };

  DataStore.drones.update(req.params.id, {
    breakpoint,
    lastUpdate: new Date().toISOString()
  });

  EventEmitter.emit('telemetry-update', {
    droneId: req.params.id,
    breakpointSaved: true
  });

  success(res, breakpoint, '断点已保存，可从中断点继续飞行');
});

/* 断点续飞 - 恢复飞行 */
dronesRouter.post('/:id/resume-flight/start', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  if (!device.breakpoint) {
    return error(res, '该无人机没有保存的断点信息，无法续飞', 400);
  }

  const breakpoint = device.breakpoint;

  // 更新无人机状态为巡检中
  DataStore.drones.update(req.params.id, {
    status: 'inspecting',
    lat: breakpoint.lat,
    lng: breakpoint.lng,
    altitude: breakpoint.altitude,
    lastUpdate: new Date().toISOString()
  });

  EventEmitter.emit('telemetry-update', {
    droneId: req.params.id,
    status: 'inspecting',
    resumedFrom: breakpoint
  });

  success(res, {
    droneId: req.params.id,
    resumed: true,
    breakpoint,
    message: `无人机已从断点（航点 ${breakpoint.waypointIndex}）恢复飞行`
  }, '断点续飞成功');
});

/* 仿地飞行 - 开启/关闭 */
dronesRouter.post('/:id/terrain-follow', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  const { enabled, followHeight } = req.body || {};

  const terrainConfig = {
    enabled: enabled !== undefined ? !!enabled : true,
    followHeight: followHeight !== undefined ? Number(followHeight) : 50,
    updatedAt: new Date().toISOString()
  };

  DataStore.drones.update(req.params.id, {
    terrainFollow: terrainConfig,
    lastUpdate: new Date().toISOString()
  });

  EventEmitter.emit('telemetry-update', {
    droneId: req.params.id,
    terrainFollow: terrainConfig
  });

  success(res, {
    droneId: req.params.id,
    ...terrainConfig,
    message: terrainConfig.enabled ? `仿地飞行已开启，保持离地高度 ${terrainConfig.followHeight}m` : '仿地飞行已关闭'
  }, '仿地飞行配置成功');
});

/* 历史遥测记录查询 */
dronesRouter.get('/:id/history', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  const { startDate, endDate, page, pageSize } = req.query;

  // 从审计日志和告警记录中提取历史数据
  let history = [];

  // 获取该无人机的告警历史
  const alarms = DataStore.alarms.getAll().filter(a => a.droneId === req.params.id);
  alarms.forEach(a => {
    history.push({
      timestamp: a.timestamp,
      type: 'alarm',
      data: {
        alarmId: a.id,
        alarmType: a.type,
        severity: a.severity,
        status: a.status,
        description: a.description,
        lat: a.lat,
        lng: a.lng
      }
    });
  });

  // 获取该无人机关联的工单历史
  const workOrders = DataStore.workOrders.getAll().filter(w => {
    // 检查工单是否与该无人机关联（通过告警ID）
    if (w.alarmId && w.alarmId !== '-') {
      const alarm = alarms.find(a => a.id === w.alarmId);
      return alarm && alarm.droneId === req.params.id;
    }
    return false;
  });
  workOrders.forEach(w => {
    history.push({
      timestamp: w.createdAt,
      type: 'work_order',
      data: {
        orderId: w.id,
        title: w.title,
        status: w.status,
        assignee: w.assignee
      }
    });
  });

  // 添加当前状态快照
  history.push({
    timestamp: device.lastUpdate || new Date().toISOString(),
    type: 'telemetry',
    data: {
      lat: device.lat,
      lng: device.lng,
      battery: device.battery,
      signal: device.signal,
      altitude: device.altitude,
      speed: device.speed,
      heading: device.heading,
      status: device.status
    }
  });

  // 日期过滤
  if (startDate) {
    const start = new Date(startDate).getTime();
    if (!Number.isNaN(start)) {
      history = history.filter(h => new Date(h.timestamp).getTime() >= start);
    }
  }
  if (endDate) {
    const end = new Date(endDate).getTime();
    if (!Number.isNaN(end)) {
      history = history.filter(h => new Date(h.timestamp).getTime() <= end);
    }
  }

  // 按时间倒序排列
  history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // 分页
  const total = history.length;
  const currentPage = parseInt(page) || 1;
  const size = parseInt(pageSize) || 50;
  const startIdx = (currentPage - 1) * size;
  const paginated = history.slice(startIdx, startIdx + size);

  success(res, {
    total,
    page: currentPage,
    pageSize: size,
    items: paginated
  }, '获取历史记录成功');
});

const geoFencesRouter = express.Router();

geoFencesRouter.get('/', (req, res) => {
  const fences = DataStore.geoFences.getAll();
  success(res, fences, '获取电子围栏列表成功');
});

geoFencesRouter.post('/', (req, res) => {
  const { name, polygon, type } = req.body || {};
  if (!name || !Array.isArray(polygon) || polygon.length < 3) {
    return error(res, '参数不合法：name 必填，polygon 至少 3 个点', 400);
  }
  
  const fences = DataStore.geoFences.getAll();
  const newFence = {
    id: `GEOFENCE-${String(fences.length + 1).padStart(3, '0')}`,
    name,
    polygon,
    type: type || 'restricted'
  };

  DataStore.geoFences.add(newFence);
  success(res, newFence, '电子围栏创建成功');
});

geoFencesRouter.delete('/:id', (req, res) => {
  const removed = DataStore.geoFences.delete(req.params.id);
  if (!removed) {
    return error(res, `未找到电子围栏: ${req.params.id}`, 404);
  }
  success(res, removed, '电子围栏已删除');
});

module.exports = { dronesRouter, geoFencesRouter };