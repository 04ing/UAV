// DJI上云API适配器
// 文档参考：https://developer.dji.com/doc/cloud-api/en/
// 采用适配器模式：优先调用真实API，不可用时自动切换到Mock数据

const crypto = require('crypto');
const https = require('https');
const EventEmitter = require('./eventEmitter');

/* =====================================================================
 * 模拟无人机机队 —— 模拟真实巡检场景中的无人机飞行数据
 * 每架无人机有自己的巡检航线（往返路径），会沿航线移动
 * ===================================================================== */
const BASE_LAT = 30.6012;
const BASE_LNG = 114.3050;

// 巡检航线定义（模拟水库大坝巡检区域）
const PATROL_ROUTES = {
  'DRONE-001': {
    name: '大坝主体日常巡检',
    waypoints: [
      { lat: 30.6012, lng: 114.3025, alt: 120 },
      { lat: 30.6035, lng: 114.3050, alt: 110 },
      { lat: 30.6050, lng: 114.3075, alt: 100 },
      { lat: 30.6035, lng: 114.3100, alt: 105 },
      { lat: 30.6012, lng: 114.3125, alt: 115 },
      { lat: 30.5985, lng: 114.3100, alt: 110 },
      { lat: 30.5980, lng: 114.3075, alt: 100 },
      { lat: 30.5990, lng: 114.3050, alt: 105 },
      { lat: 30.6012, lng: 114.3025, alt: 120 },
    ],
  },
  'DRONE-002': {
    name: '库区水面周巡检',
    waypoints: [
      { lat: 30.598, lng: 114.298, alt: 80 },
      { lat: 30.596, lng: 114.302, alt: 85 },
      { lat: 30.597, lng: 114.306, alt: 90 },
      { lat: 30.599, lng: 114.308, alt: 85 },
      { lat: 30.598, lng: 114.298, alt: 80 },
    ],
  },
  'DRONE-003': {
    name: '边坡月度巡检',
    waypoints: [
      { lat: 30.605, lng: 114.31, alt: 50 },
      { lat: 30.608, lng: 114.313, alt: 60 },
      { lat: 30.611, lng: 114.316, alt: 70 },
      { lat: 30.605, lng: 114.31, alt: 50 },
    ],
  },
  'DRONE-004': {
    name: '待命',
    waypoints: [
      { lat: 30.597, lng: 114.305, alt: 0 },
    ],
  },
  'DRONE-005': {
    name: '紧急返航',
    waypoints: [
      { lat: 30.608, lng: 114.297, alt: 20 },
      { lat: 30.606, lng: 114.300, alt: 15 },
      { lat: 30.604, lng: 114.303, alt: 10 },
      { lat: 30.601, lng: 114.305, alt: 5 },
      { lat: 30.597, lng: 114.305, alt: 0 },
    ],
  },
  'DRONE-006': {
    name: '溢洪道巡检',
    waypoints: [
      { lat: 30.602, lng: 114.315, alt: 80 },
      { lat: 30.604, lng: 114.318, alt: 85 },
      { lat: 30.606, lng: 114.321, alt: 90 },
      { lat: 30.604, lng: 114.318, alt: 85 },
      { lat: 30.602, lng: 114.315, alt: 80 },
    ],
  },
};

// 初始化模拟无人机状态
const mockDrones = [
  { id: 'DRONE-001', model: 'DJI M350 RTK', battery: 85, signal: '强', status: 'inspecting', lat: 30.6012, lng: 114.3025, altitude: 120, speed: 8, heading: 45, homeLat: BASE_LAT, homeLng: BASE_LNG },
  { id: 'DRONE-002', model: 'DJI M30T', battery: 72, signal: '强', status: 'idle', lat: 30.598, lng: 114.298, altitude: 0, speed: 0, heading: 0, homeLat: BASE_LAT, homeLng: BASE_LNG },
  { id: 'DRONE-003', model: 'DJI Matrice 300', battery: 45, signal: '中', status: 'returning', lat: 30.605, lng: 114.31, altitude: 50, speed: 12, heading: 180, homeLat: BASE_LAT, homeLng: BASE_LNG },
  { id: 'DRONE-004', model: 'DJI M350 RTK', battery: 90, signal: '强', status: 'idle', lat: 30.597, lng: 114.305, altitude: 0, speed: 0, heading: 0, homeLat: BASE_LAT, homeLng: BASE_LNG },
  { id: 'DRONE-005', model: 'DJI M30T', battery: 30, signal: '弱', status: 'returning', lat: 30.608, lng: 114.297, altitude: 20, speed: 15, heading: 225, homeLat: BASE_LAT, homeLng: BASE_LNG },
  { id: 'DRONE-006', model: 'DJI Matrice 300', battery: 65, signal: '中', status: 'inspecting', lat: 30.602, lng: 114.315, altitude: 80, speed: 6, heading: 90, homeLat: BASE_LAT, homeLng: BASE_LNG },
];

// 每架无人机的飞行进度（沿航线的进度 0~1）
const flightProgress = {};
mockDrones.forEach((d) => { flightProgress[d.id] = 0; });

/* =====================================================================
 * 故障模拟 —— 用于测试告警系统
 * 每架无人机可以处于正常/故障状态
 * ===================================================================== */
const faultStates = {};
mockDrones.forEach((d) => { faultStates[d.id] = null; });

// 故障类型定义
const FAULT_TYPES = {
  MOTOR_FAILURE: 'motor_failure',
  LOW_BATTERY: 'low_battery',
  GPS_LOST: 'gps_lost',
  SIGNAL_LOST: 'signal_lost',
  OBSTACLE: 'obstacle',
};

// 告警等级映射
const FAULT_SEVERITY = {
  motor_failure: 'critical',
  low_battery: 'warning',
  gps_lost: 'critical',
  signal_lost: 'warning',
  obstacle: 'warning',
};

// 告警描述映射
const FAULT_DESCRIPTIONS = {
  motor_failure: '无人机电机故障，立即返航！',
  low_battery: '无人机电量低于25%，触发低电量告警',
  gps_lost: '无人机GPS信号丢失，位置可能不准确',
  signal_lost: '无人机遥控信号弱，连接不稳定',
  obstacle: '无人机前方检测到障碍物',
};

// 故障持续时间（毫秒）
const FAULT_DURATION = 30000; // 30秒

/**
 * 触发无人机故障
 * @param {string} droneId - 无人机ID
 * @param {string} faultType - 故障类型
 * @returns {object} - 触发结果
 */
function triggerFault(droneId, faultType) {
  let drone = mockDrones.find((d) => d.id === droneId);

  // 如果 mockDrones 中没有，尝试从 DataStore 同步（通过 POST /api/drones/upload 注册的无人机）
  if (!drone) {
    const DataStore = require('../data/dataStore');
    const dsDrone = DataStore.drones.getById(droneId);
    if (dsDrone) {
      mockDrones.push(dsDrone);
      drone = mockDrones[mockDrones.length - 1];
    }
  }

  if (!drone) {
    return { success: false, message: `未找到无人机: ${droneId}` };
  }

  const validTypes = Object.values(FAULT_TYPES);
  if (!validTypes.includes(faultType)) {
    return { success: false, message: `无效的故障类型: ${faultType}` };
  }

  // 设置故障状态
  faultStates[droneId] = {
    type: faultType,
    triggeredAt: Date.now(),
    duration: FAULT_DURATION,
  };

  // 如果是电机故障或GPS丢失，自动触发返航
  if (faultType === FAULT_TYPES.MOTOR_FAILURE || faultType === FAULT_TYPES.GPS_LOST) {
    drone.status = 'returning';
    flightProgress[droneId] = 0;
    drone.speed = 15 + Math.round(Math.random() * 5);
  }

  return {
    success: true,
    message: `已触发 ${droneId} 的 ${faultType} 故障`,
    drone: {
      id: drone.id,
      status: drone.status,
      lat: drone.lat,
      lng: drone.lng,
    },
  };
}

/**
 * 清除无人机故障状态
 * 同时清除坠毁告警标记（如果存在）
 * @param {string} droneId - 无人机ID
 */
function clearFault(droneId) {
  // 清除故障状态
  faultStates[droneId] = null;

  // 清除坠毁告警标记（如果存在）
  clearCrashAlarmMark(droneId);

  console.log(`[DJI Mock] 已清除 ${droneId} 的故障状态和坠毁告警标记`);
}

/**
 * 获取无人机当前故障状态
 * @param {string} droneId - 无人机ID
 * @returns {object|null} - 故障状态
 */
function getFaultState(droneId) {
  return faultStates[droneId] || null;
}

/**
 * 线性插值两个坐标点
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 根据航线进度计算无人机当前位置
 */
function interpolatePosition(route, progress) {
  const waypoints = route.waypoints;
  if (!waypoints || waypoints.length < 2) return waypoints[0] || { lat: BASE_LAT, lng: BASE_LNG, alt: 0 };

  const totalSegments = waypoints.length - 1;
  const segIndex = Math.min(Math.floor(progress * totalSegments), totalSegments - 1);
  const segProgress = (progress * totalSegments) - segIndex;

  const wp1 = waypoints[segIndex];
  const wp2 = waypoints[segIndex + 1];

  return {
    lat: lerp(wp1.lat, wp2.lat, segProgress),
    lng: lerp(wp1.lng, wp2.lng, segProgress),
    alt: lerp(wp1.alt, wp2.alt, segProgress),
  };
}

/**
 * 计算航向角（从wp1到wp2的方位角）
 */
function calculateHeading(lat1, lng1, lat2, lng2) {
  const dLng = lng2 - lng1;
  const y = Math.sin(dLng * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng * Math.PI / 180);
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * 无人机坠毁/失联紧急告警生成器
 * 当无人机电量耗尽变为离线时调用
 */
const crashAlarmsGenerated = new Set();

function generateCrashAlarm(drone) {
  // 使用无人机ID作为去重key（不包含时间戳）
  const crashKey = `${drone.id}_crash`;

  // 检查是否已经生成过坠毁告警（避免重复）
  if (crashAlarmsGenerated.has(crashKey)) {
    console.log(`[DJI Mock] ⚠️ ${drone.id} 坠毁告警已存在，跳过重复生成`);
    return;
  }

  console.log(`[DJI Mock] 🚨 紧急！无人机 ${drone.id} 电量耗尽坠毁，位置: ${drone.lat}, ${drone.lng}`);

  try {
    const DataStore = require('../data/dataStore');
    const alarms = DataStore.alarms.getAll();
    const newAlarm = {
      id: `ALARM-${String(alarms.length + 1).padStart(3, '0')}`,
      type: '无人机失联',
      severity: 'critical',
      droneId: drone.id,
      lat: drone.lat,
      lng: drone.lng,
      timestamp: new Date().toISOString(),
      status: 'pending',
      description: `🚨 紧急！无人机 ${drone.id} 电量耗尽坠毁，最后位置: ${drone.lat.toFixed(6)}, ${drone.lng.toFixed(6)}，请立即组织救援！`,
      emergency: true,
      lastKnownPosition: { lat: drone.lat, lng: drone.lng, altitude: drone.altitude },
    };

    DataStore.alarms.add(newAlarm);
    EventEmitter.emit('new-alarm', newAlarm);
    EventEmitter.emit('crash-alarm', newAlarm);
    crashAlarmsGenerated.add(crashKey);

    console.log(`[DJI Mock] ✅ 坠毁告警已生成: ${newAlarm.id}`);
  } catch (err) {
    console.error('[DJI Mock] 坠毁告警生成失败:', err.message);
  }
}

/**
 * 更新模拟无人机的位置和状态（含故障检测和告警生成）
 */
function updateMockTelemetry() {
  const now = Date.now();
  mockDrones.forEach((drone) => {
    const route = PATROL_ROUTES[drone.id];
    if (!route) return;

    // 检查故障状态
    const fault = faultStates[drone.id];
    if (fault) {
      // 检查故障是否过期
      if (now - fault.triggeredAt > fault.duration) {
        clearFault(drone.id);
        console.log(`[DJI Mock] ${drone.id} 故障已过期，恢复正常状态`);
      } else {
        // 根据故障类型调整遥测数据
        switch (fault.type) {
          case FAULT_TYPES.MOTOR_FAILURE:
            // 电机故障：速度骤降、高度波动、电量快速消耗
            drone.speed = Math.max(0, drone.speed - 5 - Math.random() * 3);
            drone.altitude = Math.max(0, drone.altitude - 2 - Math.random() * 3);
            drone.battery = Math.max(0, drone.battery - 0.2);
            drone.status = drone.status !== 'offline' ? 'returning' : 'offline';
            break;
          case FAULT_TYPES.LOW_BATTERY:
            // 低电量：电量继续消耗
            drone.battery = Math.max(0, drone.battery - 0.1);
            drone.status = drone.status !== 'offline' ? 'returning' : 'offline';
            break;
          case FAULT_TYPES.GPS_LOST:
            // GPS丢失：位置随机漂移
            drone.lat += (Math.random() - 0.5) * 0.0001;
            drone.lng += (Math.random() - 0.5) * 0.0001;
            break;
          case FAULT_TYPES.SIGNAL_LOST:
            // 信号丢失：信号强度变为弱或无
            drone.signal = Math.random() > 0.5 ? '弱' : '无';
            break;
          case FAULT_TYPES.OBSTACLE:
            // 障碍物：速度降低
            drone.speed = Math.max(0, drone.speed - 3);
            break;
        }
      }
    }

    // 根据状态更新进度
    if (drone.status === 'inspecting' || drone.status === 'returning') {
      // 如果有电机故障，不推进航线
      if (fault && fault.type === FAULT_TYPES.MOTOR_FAILURE) {
        // 电机故障时停止推进
      } else {
        // 每次更新推进进度
        const speedFactor = drone.status === 'returning' ? 0.015 : 0.008;
        flightProgress[drone.id] += speedFactor;
        if (flightProgress[drone.id] >= 1) {
          flightProgress[drone.id] = 0;
          // 巡检完成后回到待命状态
          if (drone.status === 'inspecting') {
            drone.status = 'idle';
            drone.speed = 0;
            return;
          }
        }
      }

      // GPS丢失时不更新位置
      if (!(fault && fault.type === FAULT_TYPES.GPS_LOST)) {
        const pos = interpolatePosition(route, flightProgress[drone.id]);
        drone.lat = pos.lat;
        drone.lng = pos.lng;
        drone.altitude = Math.round(pos.alt);
      }

      if (!fault || fault.type === FAULT_TYPES.SIGNAL_LOST) {
        drone.speed = drone.status === 'returning' ? 12 + Math.round(Math.random() * 4) : 6 + Math.round(Math.random() * 4);
      }

      // 计算航向
      const wpIdx = Math.min(Math.floor(flightProgress[drone.id] * (route.waypoints.length - 1)), route.waypoints.length - 2);
      const wp1 = route.waypoints[wpIdx];
      const wp2 = route.waypoints[wpIdx + 1];
      drone.heading = Math.round(calculateHeading(wp1.lat, wp1.lng, wp2.lat, wp2.lng));
    } else if (drone.status === 'idle') {
      drone.speed = 0;
      // 待机时电量缓慢消耗
      drone.battery = Math.max(0, drone.battery - 0.01);
    }

    // 电量随飞行消耗
    if (drone.status === 'inspecting' || drone.status === 'returning') {
      const drainRate = (fault && fault.type === FAULT_TYPES.MOTOR_FAILURE) ? 0.2 : 0.05;
      drone.battery = Math.max(0, drone.battery - drainRate);
    }

    // 低电量自动返航（巡检状态下）
    if (drone.battery <= 25 && drone.status === 'inspecting') {
      drone.status = 'returning';
    }
    // 电量耗尽变为离线（记录最后位置，标记需救援）
    const wasOffline = drone.status === 'offline';
    if (drone.battery <= 0) {
      drone.status = 'offline';
      drone.speed = 0;
      drone.emergency = true;
      drone.lastKnownPos = { lat: drone.lat, lng: drone.lng, alt: drone.altitude };
      // 首次变为离线时触发紧急告警
      if (!wasOffline) {
        generateCrashAlarm(drone);
      }
    }

    // 信号强度随机波动（无故障时）
    if (!fault || fault.type === FAULT_TYPES.OBSTACLE) {
      const signalRand = Math.random();
      if (signalRand > 0.95) {
        drone.signal = drone.signal === '强' ? '中' : drone.signal === '中' ? '弱' : '弱';
      } else if (signalRand < 0.05) {
        drone.signal = drone.signal === '弱' ? '中' : drone.signal === '中' ? '强' : '强';
      }
    }

    drone.lastUpdate = new Date().toISOString();
  });
}

// 每3秒更新一次遥测数据（测试环境下不启动，避免并行测试间文件竞争）
const telemetryTimer = process.env.NODE_ENV === 'test' ? null : setInterval(updateMockTelemetry, 3000);
if (telemetryTimer) telemetryTimer.unref(); // 不阻止进程退出，避免Jest/PM2 reload时worker卡死

/**
 * 故障告警生成器 - 当检测到新故障时，自动创建告警记录
 * 告警通过 EventEmitter 推送到前端
 */
const generatedAlarms = new Set(); // 记录已生成的告警，避免重复

const alarmTimer = process.env.NODE_ENV === 'test' ? null : setInterval(() => {
  Object.keys(faultStates).forEach((droneId) => {
    const fault = faultStates[droneId];
    if (!fault) return;

    // 为每个故障生成唯一ID（基于无人机ID+故障类型+时间戳）
    const alarmKey = `${droneId}_${fault.type}_${Math.floor(fault.triggeredAt / 30000)}`;
    if (generatedAlarms.has(alarmKey)) return;

    const drone = mockDrones.find((d) => d.id === droneId);
    if (!drone) return;

    // 生成告警
    const newAlarm = {
      id: `ALARM-SIM-${Date.now()}`,
      type: fault.type === FAULT_TYPES.MOTOR_FAILURE ? '电机故障' :
            fault.type === FAULT_TYPES.LOW_BATTERY ? '低电量告警' :
            fault.type === FAULT_TYPES.GPS_LOST ? 'GPS信号丢失' :
            fault.type === FAULT_TYPES.SIGNAL_LOST ? '遥控信号丢失' : '障碍物检测',
      severity: FAULT_SEVERITY[fault.type] || 'warning',
      droneId,
      lat: drone.lat,
      lng: drone.lng,
      timestamp: new Date().toISOString(),
      status: 'pending',
      description: FAULT_DESCRIPTIONS[fault.type] || '无人机发生故障',
    };

    console.log(`[DJI Mock] 自动生成告警: ${newAlarm.id} - ${newAlarm.description}`);

    // 推送到告警数据存储和WebSocket
    try {
      const DataStore = require('../data/dataStore');
      const alarms = DataStore.alarms.getAll();
      newAlarm.id = `ALARM-${String(alarms.length + 1).padStart(3, '0')}`;
      DataStore.alarms.add(newAlarm);
      EventEmitter.emit('new-alarm', newAlarm);
      generatedAlarms.add(alarmKey);
    } catch (err) {
      console.error('[DJI Mock] 告警生成失败:', err.message);
    }
  });
}, 2000); // 每2秒检查一次
if (alarmTimer) alarmTimer.unref(); // 不阻止进程退出，避免Jest/PM2 reload时worker卡死

class DJIAPIAdapter {
  constructor() {
    this.appKey = process.env.DJI_APP_KEY || '';
    this.appSecret = process.env.DJI_APP_SECRET || '';
    this.baseURL = process.env.DJI_API_URL || 'https://api.dji.com';
    this.useMock = !this.appKey || !this.appSecret;

    if (this.useMock) {
      console.warn('[DJI Adapter] DJI_APP_KEY或DJI_APP_SECRET未配置，使用Mock模式');
    } else {
      console.log('[DJI Adapter] DJI上云API已配置，将优先调用真实API');
    }
  }

  /**
   * 生成HmacSHA256签名
   */
  generateSignature(timestamp, nonce, method, path, query = '', body = '') {
    const signString = `${timestamp}\n${nonce}\n${method}\n${path}\n${query}\n${body}`;
    return crypto.createHmac('sha256', this.appSecret).update(signString).digest('hex');
  }

  /**
   * 发送HTTP请求到DJI上云API
   */
  async request(method, path, params = {}, body = null) {
    if (this.useMock) {
      return this._mockRequest(method, path, params, body);
    }

    return new Promise((resolve, reject) => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      let query = '';
      if (Object.keys(params).length > 0) {
        const sortedParams = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
        query = sortedParams;
      }

      let bodyStr = '';
      if (body) {
        bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const signature = this.generateSignature(timestamp, nonce, method.toUpperCase(), path, query, bodyStr);

      const options = {
        hostname: new URL(this.baseURL).hostname,
        port: 443,
        path: `${path}${query ? `?${query}` : ''}`,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          'X-DJI-API-Key': this.appKey,
          'X-DJI-API-Timestamp': timestamp,
          'X-DJI-API-Nonce': nonce,
          'X-DJI-API-Signature': signature
        }
      };

      if (bodyStr) {
        options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(result);
            } else {
              console.error(`[DJI API] 请求失败 ${res.statusCode}:`, result);
              resolve(this._mockRequest(method, path, params, body));
            }
          } catch (e) {
            console.error(`[DJI API] 响应解析失败:`, e);
            resolve(this._mockRequest(method, path, params, body));
          }
        });
      });

      req.on('error', (e) => {
        console.error(`[DJI API] 网络错误:`, e.message);
        resolve(this._mockRequest(method, path, params, body));
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  /**
   * Mock数据生成器（API不可用时的回退）
   * 支持动态路径匹配，如 /api/v1/drones/DRONE-001/telemetry
   */
  _mockRequest(method, path, params = {}, body = null) {
    // 匹配 /api/v1/drones/:id/telemetry
    const telemetryMatch = path.match(/^\/api\/v1\/drones\/(.+)\/telemetry$/);
    // 匹配 /api/v1/drones/:id/health
    const healthMatch = path.match(/^\/api\/v1\/drones\/(.+)\/health$/);
    // 匹配 /api/v1/drones/:id/tasks
    const tasksMatch = path.match(/^\/api\/v1\/drones\/(.+)\/tasks$/);
    // 匹配 /api/v1/drones/:id/return-home
    const returnHomeMatch = path.match(/^\/api\/v1\/drones\/(.+)\/return-home$/);
    // 匹配 /api/v1/drones/:id
    const droneMatch = path.match(/^\/api\/v1\/drones\/(.+)$/);

    // 获取无人机ID（从path或params或body）
    const droneId = (telemetryMatch && telemetryMatch[1]) ||
                    (healthMatch && healthMatch[1]) ||
                    (tasksMatch && tasksMatch[1]) ||
                    (returnHomeMatch && returnHomeMatch[1]) ||
                    (droneMatch && droneMatch[1]) ||
                    (params && params.id) ||
                    (body && body.id) ||
                    '';

    if (path === '/api/v1/drones') {
      return { code: 0, data: mockDrones, msg: 'success' };
    }

    if (telemetryMatch) {
      const drone = mockDrones.find(d => d.id === droneId) || mockDrones[0];
      const route = PATROL_ROUTES[drone.id];
      const fault = faultStates[droneId];
      return {
        code: 0,
        data: {
          droneId: drone.id,
          timestamp: new Date().toISOString(),
          lat: drone.lat,
          lng: drone.lng,
          battery: Math.round(drone.battery),
          signal: drone.signal,
          altitude: drone.altitude || 0,
          velocity: drone.speed || 0,
          heading: drone.heading || 0,
          status: drone.status,
          satellites: 18 + Math.floor(Math.random() * 6),
          pitch: -15 + Math.round(Math.random() * 10),
          yaw: drone.heading || 0,
          gimbalPitch: -30 + Math.round(Math.random() * 20),
          windSpeed: (2 + Math.random() * 5).toFixed(1),
          temperature: (25 + Math.random() * 8).toFixed(1),
          humidity: (55 + Math.random() * 15).toFixed(1),
          flightTime: Math.floor(Math.random() * 1800) + 600,
          routeName: route ? route.name : '未知航线',
          fault: fault ? {
            type: fault.type,
            description: FAULT_DESCRIPTIONS[fault.type] || '未知故障',
            triggeredAt: new Date(fault.triggeredAt).toISOString(),
          } : null,
        },
        msg: 'success'
      };
    }

    if (healthMatch) {
      const drone = mockDrones.find(d => d.id === droneId) || mockDrones[0];
      const fault = faultStates[droneId];
      
      // 根据故障类型计算组件状态
      let overall = drone.status === 'offline' ? 'error' : drone.battery < 20 ? 'warning' : 'good';
      let motorsStatus = 'good';
      let gpsStatus = 'good';
      let signalStatus = 'good';
      let motorsRpm = drone.speed > 0 ? [4500 + Math.floor(Math.random() * 500), 4480 + Math.floor(Math.random() * 500), 4520 + Math.floor(Math.random() * 500), 4490 + Math.floor(Math.random() * 500)] : [0, 0, 0, 0];
      
      if (fault) {
        if (fault.type === FAULT_TYPES.MOTOR_FAILURE) {
          motorsStatus = 'error';
          overall = 'error';
          // 一个电机转速异常
          motorsRpm = [4500, 4480, 1200 + Math.floor(Math.random() * 300), 4490];
        } else if (fault.type === FAULT_TYPES.GPS_LOST) {
          gpsStatus = 'error';
          overall = 'error';
        } else if (fault.type === FAULT_TYPES.SIGNAL_LOST) {
          signalStatus = 'warning';
        } else if (fault.type === FAULT_TYPES.LOW_BATTERY) {
          overall = 'warning';
        }
      }
      
      return {
        code: 0,
        data: {
          droneId: drone.id,
          overall,
          components: {
            battery: { status: drone.battery < 20 ? 'warning' : 'good', level: Math.round(drone.battery), cycles: Math.floor(Math.random() * 200) + 50 },
            motors: { status: motorsStatus, rpm: motorsRpm },
            gps: { status: gpsStatus, satellites: gpsStatus === 'error' ? Math.floor(Math.random() * 3) : 18 + Math.floor(Math.random() * 6), hdop: gpsStatus === 'error' ? '9.99' : (0.8 + Math.random() * 0.4).toFixed(2) },
            gimbal: { status: 'good', pitch: -30 + Math.floor(Math.random() * 20), yaw: drone.heading || 0 },
            camera: { status: 'good', temperature: 35 + Math.floor(Math.random() * 10), recording: drone.status === 'inspecting' },
            obstacleSensor: { status: fault && fault.type === FAULT_TYPES.OBSTACLE ? 'warning' : 'good', front: fault && fault.type === FAULT_TYPES.OBSTACLE ? 5 + Math.floor(Math.random() * 3) : 15 + Math.floor(Math.random() * 10), rear: 15 + Math.floor(Math.random() * 10) },
          },
          storage: { total: 512, used: Math.floor(Math.random() * 200) + 100, unit: 'GB' },
          firmware: { version: 'v4.1.2.3', lastUpdate: '2026-07-15T08:00:00Z' },
          fault: fault ? {
            type: fault.type,
            description: FAULT_DESCRIPTIONS[fault.type] || '未知故障',
          } : null,
        },
        msg: 'success'
      };
    }

    if (tasksMatch) {
      const drone = mockDrones.find(d => d.id === droneId) || mockDrones[0];
      const route = PATROL_ROUTES[drone.id];
      const totalWaypoints = route ? route.waypoints.length : 0;
      const currentWp = Math.floor((flightProgress[drone.id] || 0) * totalWaypoints);
      return {
        code: 0,
        data: {
          droneId: drone.id,
          currentTask: route ? route.name : '无任务',
          taskStatus: drone.status === 'inspecting' ? 'executing' : drone.status === 'returning' ? 'returning' : 'idle',
          progress: Math.round((flightProgress[drone.id] || 0) * 100),
          totalWaypoints,
          completedWaypoints: currentWp,
          currentWaypoint: Math.min(currentWp + 1, totalWaypoints),
          estimatedTime: drone.status === 'inspecting' ? Math.floor((1 - (flightProgress[drone.id] || 0)) * 1200) : 0,
          routeName: route ? route.name : '--',
        },
        msg: 'success'
      };
    }

    if (returnHomeMatch) {
      const drone = mockDrones.find(d => d.id === droneId);
      if (drone) {
        drone.status = 'returning';
        flightProgress[drone.id] = 0;
      }
      return { code: 0, data: { status: 'returning', message: '无人机已开始返航' }, msg: 'success' };
    }

    if (droneMatch) {
      const drone = mockDrones.find(d => d.id === droneId) || mockDrones[0];
      return { code: 0, data: drone, msg: 'success' };
    }

    if (path === '/api/v1/alarms') {
      return { code: 0, data: [], msg: 'success' };
    }

    return { code: 0, data: [], msg: 'success' };
  }

  /**
   * 获取机队列表
   */
  async getDrones() {
    const result = await this.request('GET', '/api/v1/drones');
    return result.data || [];
  }

  /**
   * 获取无人机详情
   */
  async getDroneById(id) {
    const result = await this.request('GET', `/api/v1/drones/${id}`);
    return result.data || null;
  }

  /**
   * 获取无人机实时遥测数据
   */
  async getTelemetry(id) {
    const result = await this.request('GET', `/api/v1/drones/${id}/telemetry`);
    return result.data || null;
  }

  /**
   * 获取无人机健康诊断
   */
  async getHealth(id) {
    const result = await this.request('GET', `/api/v1/drones/${id}/health`);
    return result.data || null;
  }

  /**
   * 获取无人机当前任务信息
   */
  async getTasks(id) {
    const result = await this.request('GET', `/api/v1/drones/${id}/tasks`);
    return result.data || null;
  }

  /**
   * 一键返航
   */
  async returnHome(id) {
    const result = await this.request('POST', `/api/v1/drones/${id}/return-home`);
    return result;
  }

  /**
   * 获取告警列表
   */
  async getAlarms() {
    const result = await this.request('GET', '/api/v1/alarms');
    return result.data || [];
  }
}

/**
 * 清除坠毁告警标记（当无人机恢复正常时调用）
 * @param {string} droneId 无人机ID
 */
function clearCrashAlarmMark(droneId) {
  const crashKey = `${droneId}_crash`;
  if (crashAlarmsGenerated.has(crashKey)) {
    crashAlarmsGenerated.delete(crashKey);
    console.log(`[DJI Mock] 已清除 ${droneId} 的坠毁告警标记`);
    return true;
  }
  return false;
}

/**
 * 清理所有定时器（用于 PM2 reload/shutdown 时避免定时器泄漏）
 */
function cleanupTimers() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  if (alarmTimer) clearInterval(alarmTimer);
  console.log('[DJI Adapter] 定时器已清理');
}

// 导出 DJIAPIAdapter 实例和故障模拟相关函数
const djiAdapter = new DJIAPIAdapter();
module.exports = djiAdapter;
module.exports.FAULT_TYPES = FAULT_TYPES;
module.exports.triggerFault = triggerFault;
module.exports.clearFault = clearFault;
module.exports.getFaultState = getFaultState;
module.exports.generateCrashAlarm = generateCrashAlarm;
module.exports.clearCrashAlarmMark = clearCrashAlarmMark;
module.exports.cleanupTimers = cleanupTimers;
