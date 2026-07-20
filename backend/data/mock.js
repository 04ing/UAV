// Mock 数据生成函数集合
// 坐标基准：武汉附近某水库 (30.6°N, 114.3°E)

const BASE_LAT = 30.6;
const BASE_LNG = 114.3;

// 6-8 台无人机
function getDrones() {
  return [
    {
      id: 'DRONE-001',
      model: 'DJI M350',
      battery: 85,
      signal: '强',
      status: 'inspecting',
      lat: 30.6012,
      lng: 114.3025,
      lastUpdate: '2026-07-20T10:30:00Z'
    },
    {
      id: 'DRONE-002',
      model: 'DJI M30T',
      battery: 72,
      signal: '强',
      status: 'idle',
      lat: 30.5980,
      lng: 114.2980,
      lastUpdate: '2026-07-20T10:29:50Z'
    },
    {
      id: 'DRONE-003',
      model: 'DJI Matrice 300',
      battery: 45,
      signal: '中',
      status: 'returning',
      lat: 30.6050,
      lng: 114.3100,
      lastUpdate: '2026-07-20T10:29:40Z'
    },
    {
      id: 'DRONE-004',
      model: 'DJI M350',
      battery: 90,
      signal: '强',
      status: 'idle',
      lat: 30.5970,
      lng: 114.3050,
      lastUpdate: '2026-07-20T10:29:30Z'
    },
    {
      id: 'DRONE-005',
      model: 'DJI M30T',
      battery: 30,
      signal: '弱',
      status: 'returning',
      lat: 30.6080,
      lng: 114.2970,
      lastUpdate: '2026-07-20T10:29:20Z'
    },
    {
      id: 'DRONE-006',
      model: 'DJI Matrice 300',
      battery: 65,
      signal: '中',
      status: 'inspecting',
      lat: 30.6020,
      lng: 114.3150,
      lastUpdate: '2026-07-20T10:29:10Z'
    },
    {
      id: 'DRONE-007',
      model: 'DJI M350',
      battery: 0,
      signal: '弱',
      status: 'offline',
      lat: 30.5990,
      lng: 114.3000,
      lastUpdate: '2026-07-20T09:00:00Z'
    }
  ];
}

// 10 条告警记录
function getAlarms() {
  return [
    {
      id: 'ALARM-001',
      type: '裂缝',
      severity: 'high',
      droneId: 'DRONE-001',
      lat: 30.6015,
      lng: 114.3028,
      timestamp: '2026-07-20T09:15:00Z',
      status: 'pending',
      imageUrl: '/uploads/alarm-001.jpg'
    },
    {
      id: 'ALARM-002',
      type: '漂浮物',
      severity: 'medium',
      droneId: 'DRONE-002',
      lat: 30.5985,
      lng: 114.2985,
      timestamp: '2026-07-20T09:20:00Z',
      status: 'processing',
      imageUrl: '/uploads/alarm-002.jpg'
    },
    {
      id: 'ALARM-003',
      type: '渗漏',
      severity: 'high',
      droneId: 'DRONE-003',
      lat: 30.6055,
      lng: 114.3105,
      timestamp: '2026-07-20T09:25:00Z',
      status: 'pending',
      imageUrl: '/uploads/alarm-003.jpg'
    },
    {
      id: 'ALARM-004',
      type: '边坡滑塌',
      severity: 'high',
      droneId: 'DRONE-006',
      lat: 30.6025,
      lng: 114.3155,
      timestamp: '2026-07-20T09:30:00Z',
      status: 'closed',
      imageUrl: '/uploads/alarm-004.jpg'
    },
    {
      id: 'ALARM-005',
      type: '违章复垦',
      severity: 'medium',
      droneId: 'DRONE-001',
      lat: 30.6018,
      lng: 114.3030,
      timestamp: '2026-07-20T09:35:00Z',
      status: 'pending',
      imageUrl: '/uploads/alarm-005.jpg'
    },
    {
      id: 'ALARM-006',
      type: '建筑物漏损',
      severity: 'low',
      droneId: 'DRONE-002',
      lat: 30.5988,
      lng: 114.2990,
      timestamp: '2026-07-20T09:40:00Z',
      status: 'closed',
      imageUrl: '/uploads/alarm-006.jpg'
    },
    {
      id: 'ALARM-007',
      type: '人员入侵',
      severity: 'high',
      droneId: 'DRONE-006',
      lat: 30.6028,
      lng: 114.3160,
      timestamp: '2026-07-20T09:45:00Z',
      status: 'processing',
      imageUrl: '/uploads/alarm-007.jpg'
    },
    {
      id: 'ALARM-008',
      type: '裂缝',
      severity: 'medium',
      droneId: 'DRONE-003',
      lat: 30.6060,
      lng: 114.3110,
      timestamp: '2026-07-20T09:50:00Z',
      status: 'pending',
      imageUrl: '/uploads/alarm-008.jpg'
    },
    {
      id: 'ALARM-009',
      type: '漂浮物',
      severity: 'low',
      droneId: 'DRONE-001',
      lat: 30.6020,
      lng: 114.3035,
      timestamp: '2026-07-20T09:55:00Z',
      status: 'closed',
      imageUrl: '/uploads/alarm-009.jpg'
    },
    {
      id: 'ALARM-010',
      type: '渗漏',
      severity: 'medium',
      droneId: 'DRONE-006',
      lat: 30.6030,
      lng: 114.3165,
      timestamp: '2026-07-20T10:00:00Z',
      status: 'processing',
      imageUrl: '/uploads/alarm-010.jpg'
    }
  ];
}

// 8 条工单
function getWorkOrders() {
  return [
    {
      id: 'WO-001',
      alarmId: 'ALARM-001',
      title: '大坝左岸裂缝修复',
      status: 'pending',
      assignee: '张工',
      createdAt: '2026-07-20T09:20:00Z',
      updatedAt: '2026-07-20T09:20:00Z',
      description: 'DRONE-001 在大坝左岸发现长约 2m 裂缝，需紧急评估结构影响'
    },
    {
      id: 'WO-002',
      alarmId: 'ALARM-002',
      title: '库区漂浮物清理',
      status: 'processing',
      assignee: '李工',
      createdAt: '2026-07-20T09:25:00Z',
      updatedAt: '2026-07-20T09:30:00Z',
      description: '库区水面发现大量漂浮物，已安排清理船只作业'
    },
    {
      id: 'WO-003',
      alarmId: 'ALARM-003',
      title: '右坝肩渗漏处理',
      status: 'review',
      assignee: '王工',
      createdAt: '2026-07-20T09:30:00Z',
      updatedAt: '2026-07-20T10:00:00Z',
      description: '右坝肩发现渗漏点，已完成临时止水处理，待专家复核'
    },
    {
      id: 'WO-004',
      alarmId: 'ALARM-004',
      title: '边坡滑塌加固',
      status: 'closed',
      assignee: '赵工',
      createdAt: '2026-07-20T09:35:00Z',
      updatedAt: '2026-07-20T11:00:00Z',
      description: '边坡滑塌区域已完成锚固与喷砼施工并验收通过'
    },
    {
      id: 'WO-005',
      alarmId: 'ALARM-005',
      title: '违章复垦制止',
      status: 'pending',
      assignee: '张工',
      createdAt: '2026-07-20T09:40:00Z',
      updatedAt: '2026-07-20T09:40:00Z',
      description: '库区管理范围内发现违规复垦行为，需联系水政执法'
    },
    {
      id: 'WO-006',
      alarmId: 'ALARM-006',
      title: '管理房漏损维修',
      status: 'closed',
      assignee: '李工',
      createdAt: '2026-07-20T09:45:00Z',
      updatedAt: '2026-07-20T10:30:00Z',
      description: '管理房屋顶漏损已完成防水层维修'
    },
    {
      id: 'WO-007',
      alarmId: 'ALARM-007',
      title: '库区人员入侵调查',
      status: 'processing',
      assignee: '王工',
      createdAt: '2026-07-20T09:50:00Z',
      updatedAt: '2026-07-20T10:10:00Z',
      description: '监控发现未授权人员进入库区核心范围，安保已赶赴现场'
    },
    {
      id: 'WO-008',
      alarmId: 'ALARM-008',
      title: '溢洪道裂缝评估',
      status: 'review',
      assignee: '赵工',
      createdAt: '2026-07-20T09:55:00Z',
      updatedAt: '2026-07-20T10:20:00Z',
      description: '溢洪道侧墙裂缝已完成现场裂缝宽度检测，待结构评估'
    }
  ];
}

// 5 条巡检计划
function getInspectionPlans() {
  return [
    {
      id: 'PLAN-001',
      name: '大坝主体日常巡检',
      droneId: 'DRONE-001',
      route: [
        { lat: 30.6012, lng: 114.3025 },
        { lat: 30.6020, lng: 114.3050 },
        { lat: 30.6010, lng: 114.3075 },
        { lat: 30.6000, lng: 114.3050 }
      ],
      frequency: 'daily',
      startTime: '2026-07-20T08:00:00Z',
      status: 'running'
    },
    {
      id: 'PLAN-002',
      name: '库区水面周巡检',
      droneId: 'DRONE-002',
      route: [
        { lat: 30.5980, lng: 114.2980 },
        { lat: 30.5990, lng: 114.3010 },
        { lat: 30.5970, lng: 114.3030 }
      ],
      frequency: 'weekly',
      startTime: '2026-07-21T08:00:00Z',
      status: 'pending'
    },
    {
      id: 'PLAN-003',
      name: '边坡月度巡检',
      droneId: 'DRONE-003',
      route: [
        { lat: 30.6050, lng: 114.3100 },
        { lat: 30.6060, lng: 114.3120 },
        { lat: 30.6070, lng: 114.3140 }
      ],
      frequency: 'monthly',
      startTime: '2026-07-15T08:00:00Z',
      status: 'done'
    },
    {
      id: 'PLAN-004',
      name: '管理区夜间巡检',
      droneId: 'DRONE-004',
      route: [
        { lat: 30.5970, lng: 114.3050 },
        { lat: 30.5980, lng: 114.3060 },
        { lat: 30.5990, lng: 114.3070 }
      ],
      frequency: 'daily',
      startTime: '2026-07-20T22:00:00Z',
      status: 'pending'
    },
    {
      id: 'PLAN-005',
      name: '溢洪道专项巡检',
      droneId: 'DRONE-006',
      route: [
        { lat: 30.6020, lng: 114.3150 },
        { lat: 30.6030, lng: 114.3160 },
        { lat: 30.6040, lng: 114.3170 }
      ],
      frequency: 'weekly',
      startTime: '2026-07-20T09:00:00Z',
      status: 'running'
    }
  ];
}

// 4 个 AI 模型（type 取自 7 类：crack/floating/seepage/slope/illegal_reclamation/building_leak/intrusion）
function getAIModels() {
  return [
    {
      id: 'MODEL-001',
      name: '裂缝识别模型',
      version: 'v2.3.0',
      type: 'crack',
      accuracy: 96.5,
      deployedAt: '2026-06-01T00:00:00Z',
      edgeStatus: 'deployed'
    },
    {
      id: 'MODEL-002',
      name: '漂浮物检测模型',
      version: 'v1.8.2',
      type: 'floating',
      accuracy: 94.2,
      deployedAt: '2026-06-10T00:00:00Z',
      edgeStatus: 'deployed'
    },
    {
      id: 'MODEL-003',
      name: '渗漏识别模型',
      version: 'v1.5.0',
      type: 'seepage',
      accuracy: 92.8,
      deployedAt: '2026-06-15T00:00:00Z',
      edgeStatus: 'pending'
    },
    {
      id: 'MODEL-004',
      name: '人员入侵检测模型',
      version: 'v2.0.1',
      type: 'intrusion',
      accuracy: 97.1,
      deployedAt: '2026-06-20T00:00:00Z',
      edgeStatus: 'deployed'
    }
  ];
}

// 15 条审计日志
function getAuditLogs() {
  return [
    { id: 'LOG-001', user: 'admin', action: 'login', target: '-', ip: '192.168.1.10', timestamp: '2026-07-20T08:00:00Z' },
    { id: 'LOG-002', user: 'admin', action: 'create', target: 'PLAN-001', ip: '192.168.1.10', timestamp: '2026-07-20T08:05:00Z' },
    { id: 'LOG-003', user: 'operator1', action: 'login', target: '-', ip: '192.168.1.11', timestamp: '2026-07-20T08:10:00Z' },
    { id: 'LOG-004', user: 'operator1', action: 'start_inspection', target: 'PLAN-001', ip: '192.168.1.11', timestamp: '2026-07-20T08:15:00Z' },
    { id: 'LOG-005', user: 'operator1', action: 'ack_alarm', target: 'ALARM-001', ip: '192.168.1.11', timestamp: '2026-07-20T09:16:00Z' },
    { id: 'LOG-006', user: 'admin', action: 'create_work_order', target: 'WO-001', ip: '192.168.1.10', timestamp: '2026-07-20T09:20:00Z' },
    { id: 'LOG-007', user: 'operator1', action: 'update_work_order', target: 'WO-002', ip: '192.168.1.11', timestamp: '2026-07-20T09:30:00Z' },
    { id: 'LOG-008', user: 'viewer1', action: 'login', target: '-', ip: '192.168.1.12', timestamp: '2026-07-20T09:35:00Z' },
    { id: 'LOG-009', user: 'viewer1', action: 'view_alarm', target: 'ALARM-004', ip: '192.168.1.12', timestamp: '2026-07-20T09:40:00Z' },
    { id: 'LOG-010', user: 'admin', action: 'deploy_model', target: 'MODEL-001', ip: '192.168.1.10', timestamp: '2026-07-20T09:45:00Z' },
    { id: 'LOG-011', user: 'operator1', action: 'close_alarm', target: 'ALARM-004', ip: '192.168.1.11', timestamp: '2026-07-20T10:00:00Z' },
    { id: 'LOG-012', user: 'admin', action: 'update_geofence', target: 'GEOFENCE-001', ip: '192.168.1.10', timestamp: '2026-07-20T10:05:00Z' },
    { id: 'LOG-013', user: 'operator1', action: 'return_drone', target: 'DRONE-003', ip: '192.168.1.11', timestamp: '2026-07-20T10:10:00Z' },
    { id: 'LOG-014', user: 'admin', action: 'create_user', target: 'USER-003', ip: '192.168.1.10', timestamp: '2026-07-20T10:15:00Z' },
    { id: 'LOG-015', user: 'viewer1', action: 'logout', target: '-', ip: '192.168.1.12', timestamp: '2026-07-20T10:20:00Z' }
  ];
}

// 3 个电子围栏
function getGeoFences() {
  return [
    {
      id: 'GEOFENCE-001',
      name: '大坝核心区',
      polygon: [
        { lat: 30.6012, lng: 114.3025 },
        { lat: 30.6050, lng: 114.3050 },
        { lat: 30.6030, lng: 114.3100 },
        { lat: 30.5990, lng: 114.3070 }
      ],
      type: 'restricted'
    },
    {
      id: 'GEOFENCE-002',
      name: '库区禁飞区',
      polygon: [
        { lat: 30.5980, lng: 114.2980 },
        { lat: 30.6020, lng: 114.2990 },
        { lat: 30.6010, lng: 114.3030 },
        { lat: 30.5970, lng: 114.3010 }
      ],
      type: 'no-fly'
    },
    {
      id: 'GEOFENCE-003',
      name: '管理区',
      polygon: [
        { lat: 30.5970, lng: 114.3050 },
        { lat: 30.5990, lng: 114.3060 },
        { lat: 30.5990, lng: 114.3080 },
        { lat: 30.5970, lng: 114.3070 }
      ],
      type: 'restricted'
    }
  ];
}

// 3 个用户（明文密码，仅演示用）
function getUsers() {
  return [
    { id: 'USER-001', username: 'admin', password: 'admin123', role: 'admin', name: '系统管理员' },
    { id: 'USER-002', username: 'operator1', password: 'op123456', role: 'operator', name: '张操作员' },
    { id: 'USER-003', username: 'viewer1', password: 'view1234', role: 'viewer', name: '李查看员' }
  ];
}

module.exports = {
  BASE_LAT,
  BASE_LNG,
  getDrones,
  getAlarms,
  getWorkOrders,
  getInspectionPlans,
  getAIModels,
  getAuditLogs,
  getGeoFences,
  getUsers
};
