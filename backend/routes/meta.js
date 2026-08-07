// Task 7：接口元数据 API
// 提供所有 API 端点（含 WebSocket）的元数据清单

const express = require('express');
const { success } = require('../utils/response');

const router = express.Router();

// 端点元数据清单
const ENDPOINTS = [
  // ---------- 飞控 ----------
  { category: '飞控', method: 'GET',    path: '/api/drones',                       description: '机队列表',           params: '',                                        response: '{code:0, data: [Drone]}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id',                   description: '无人机详情',         params: 'id',                                      response: '{code:0, data: Drone}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/upload',                description: '批量上传无人机数据', params: '{drones: [Drone]}',                       response: '{code:0, data: {uploaded, updated, total}}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/return-home',       description: '一键返航',  params: 'id',                                      response: '{code:0, data: Drone}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/telemetry',         description: '实时遥测数据',       params: 'id',                                      response: '{code:0, data: {lat,lng,battery,signal,altitude,velocity}}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/telemetry',         description: '上报遥测数据（真实无人机接入）', params: 'id, {lat,lng,battery,altitude,speed,heading}', response: '{code:0, data: Telemetry}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/health',             description: '健康诊断',           params: 'id',                                      response: '{code:0, data: {droneId,overall,components}}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/tasks',              description: '当前任务信息',       params: 'id',                                      response: '{code:0, data: {droneId,currentTask,progress}}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/fault',              description: '触发故障（模拟引擎）', params: 'id, {faultType}',                         response: '{code:0, data: {success,drone}}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/fault',              description: '查询故障状态',       params: 'id',                                      response: '{code:0, data: {fault,status}}' },
  { category: '飞控', method: 'DELETE', path: '/api/drones/:id/fault',              description: '清除故障（恢复巡检）', params: 'id',                                      response: '{code:0, data: {cleared,emergencyCleared}}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/fault-types/list',       description: '故障类型列表',       params: '',                                        response: '{code:0, data: [{value,label}]}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/flight-params',      description: '获取飞行参数配置',   params: 'id',                                      response: '{code:0, data: FlightParams}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/flight-params',      description: '保存飞行参数配置',   params: 'id, {obstacleAvoidance, terrainFollow, resumeFlight, obstacleDistance, maxAltitude, maxSpeed}', response: '{code:0, data: FlightParams}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/resume-flight/save', description: '保存断点（断点续飞）', params: 'id, {waypointIndex, flightProgress, routeId, lat, lng, altitude}', response: '{code:0, data: Breakpoint}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/resume-flight/start', description: '恢复飞行（断点续飞）', params: 'id',                                    response: '{code:0, data: {resumed, breakpoint}}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/terrain-follow',     description: '仿地飞行开关',       params: 'id, {enabled, followHeight}',             response: '{code:0, data: {enabled, followHeight}}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/history',            description: '历史记录查询（遥测/告警/工单）', params: 'id, ?startDate, ?endDate, ?page, ?pageSize', response: '{code:0, data: {total, page, items}}' },
  { category: '飞控', method: 'GET',    path: '/api/geo-fences',                   description: '电子围栏列表',       params: '',                                        response: '{code:0, data: [GeoFence]}' },
  { category: '飞控', method: 'POST',   path: '/api/geo-fences',                   description: '创建电子围栏',       params: '{name, polygon, type}',                   response: '{code:0, data: GeoFence}' },
  { category: '飞控', method: 'DELETE', path: '/api/geo-fences/:id',               description: '删除电子围栏',       params: 'id',                                      response: '{code:0, data: GeoFence}' },

  // ---------- AI ----------
  { category: 'AI',   method: 'GET',    path: '/api/ai/models',                   description: 'AI 模型列表',         params: '',                                        response: '{code:0, data: [Model]}' },
  { category: 'AI',   method: 'POST',   path: '/api/ai/recognize',                  description: '图片识别（multipart 上传 file）', params: 'file(file)',                   response: '{code:0, data: {boxes, summary}}' },
  { category: 'AI',   method: 'POST',   path: '/api/ai/models/:id/deploy',         description: '模型下发（异步任务）', params: 'id',                                    response: '{code:0, data: {taskId, status}}' },
  { category: 'AI',   method: 'GET',    path: '/api/ai/models/:id/deploy/status',   description: '查询下发进度（自增）', params: 'id',                                   response: '{code:0, data: {taskId, progress, status}}' },

  // ---------- 业务 ----------
  { category: '业务', method: 'GET',    path: '/api/inspection-plans',             description: '巡检计划列表',       params: '',                                        response: '{code:0, data: [Plan]}' },
  { category: '业务', method: 'POST',   path: '/api/inspection-plans',             description: '创建巡检计划',       params: '{name, droneId, route, frequency, startTime}', response: '{code:0, data: Plan}' },
  { category: '业务', method: 'GET',    path: '/api/inspection-plans/:id',          description: '巡检计划详情',       params: 'id',                                      response: '{code:0, data: Plan}' },
  { category: '业务', method: 'PUT',    path: '/api/inspection-plans/:id',          description: '更新巡检计划',       params: 'id, {name, droneId, route, frequency, startTime, status}', response: '{code:0, data: Plan}' },
  { category: '业务', method: 'DELETE', path: '/api/inspection-plans/:id',          description: '删除巡检计划',       params: 'id',                                      response: '{code:0, data: Plan}' },
  { category: '业务', method: 'GET',    path: '/api/work-orders',                  description: '工单列表（支持 ?status=）', params: 'status?',                          response: '{code:0, data: [WorkOrder]}' },
  { category: '业务', method: 'POST',   path: '/api/work-orders',                  description: '创建工单',           params: '{alarmId, title, assignee, description}', response: '{code:0, data: WorkOrder}' },
  { category: '业务', method: 'GET',    path: '/api/work-orders/:id',               description: '工单详情',           params: 'id',                                      response: '{code:0, data: WorkOrder}' },
  { category: '业务', method: 'PUT',    path: '/api/work-orders/:id',               description: '更新工单状态',       params: 'id, {status, assignee, opinion}',         response: '{code:0, data: WorkOrder}' },
  { category: '业务', method: 'DELETE', path: '/api/work-orders/:id',               description: '删除工单',           params: 'id',                                      response: '{code:0, data: WorkOrder}' },
  { category: '业务', method: 'GET',    path: '/api/alarms',                       description: '告警列表（支持 ?severity=&status=&droneId=）', params: 'severity?,status?,droneId?', response: '{code:0, data: [Alarm]}' },
  { category: '业务', method: 'POST',   path: '/api/alarms/upload',                  description: '批量上传告警（真实无人机接入）', params: '{alarms: [Alarm]}',                response: '{code:0, data: {total,uploaded}}' },
  { category: '业务', method: 'PUT',    path: '/api/alarms/:id',                    description: '更新告警状态',       params: 'id, {status}',                            response: '{code:0, data: Alarm}' },
  { category: '业务', method: 'DELETE', path: '/api/alarms/:id',                    description: '删除告警',           params: 'id',                                      response: '{code:0, data: Alarm}' },

  // ---------- 运维 ----------
  { category: '运维', method: 'POST',   path: '/api/auth/login',                   description: '用户登录',           params: '{username, password}',                    response: '{code:0, data: {token, user}}' },
  { category: '运维', method: 'POST',   path: '/api/auth/register',                description: '用户注册',           params: '{username, password, name?}',            response: '{code:0, data: {token, user}}' },
  { category: '运维', method: 'GET',    path: '/api/auth/me',                      description: '当前用户信息',       params: 'Authorization: Bearer <token>',           response: '{code:0, data: User}' },
  { category: '运维', method: 'PUT',    path: '/api/auth/me',                      description: '更新个人信息',       params: '{name}',                                  response: '{code:0, data: {user, token}}' },
  { category: '运维', method: 'PUT',    path: '/api/auth/me/password',             description: '修改密码',           params: '{oldPassword, newPassword}',             response: '{code:0}' },
  { category: '运维', method: 'POST',   path: '/api/auth/logout',                  description: '退出登录',           params: '',                                        response: '{code:0}' },
  { category: '运维', method: 'GET',    path: '/api/auth/users',                   description: '用户列表',           params: '',                                        response: '{code:0, data: [User]}' },
  { category: '运维', method: 'POST',   path: '/api/auth/users',                   description: '创建用户',           params: '{username, password, role, name?}',      response: '{code:0, data: User}' },
  { category: '运维', method: 'PUT',    path: '/api/auth/users/:id',               description: '更新用户角色/信息',  params: 'id, {role?, name?, status?}',            response: '{code:0, data: User}' },
  { category: '运维', method: 'DELETE', path: '/api/auth/users/:id',               description: '删除用户',           params: 'id',                                      response: '{code:0, data: {deleted}}' },
  { category: '运维', method: 'GET',    path: '/api/audit-logs',                    description: '审计日志（支持 ?keyword=&startDate=&endDate=&page=&pageSize=）', params: 'keyword?,startDate?,endDate?,page?,pageSize?', response: '{code:0, data: {total, page, items}}' },
  { category: '运维', method: 'POST',   path: '/api/ops/backup',                   description: '创建数据备份',       params: '',                                        response: '{code:0, data: {fileName, size, recordCounts}}' },
  { category: '运维', method: 'GET',    path: '/api/ops/backup',                   description: '获取备份列表',       params: '',                                        response: '{code:0, data: [{fileName, size, createdAt}]}' },
  { category: '运维', method: 'DELETE', path: '/api/ops/backup/:fileName',          description: '删除备份',           params: 'fileName',                                response: '{code:0, data: {deleted}}' },

  // ---------- 元数据 ----------
  { category: '元数据', method: 'GET',  path: '/api/meta/endpoints',                description: '接口元数据',         params: '',                                        response: '{code:0, data: [Endpoint]}' },
  { category: '元数据', method: 'GET',  path: '/api/meta/health',                   description: '健康检查',           params: '',                                        response: '{code:0, data: {status, timestamp}}' },

  // ---------- WebSocket ----------
  { category: 'WebSocket', method: 'WS', path: '/ws/video',                        description: '视频帧推送', params: '',                                    response: 'JSON: {type, droneId, timestamp, frameIndex, dataUrl}' },
  { category: 'WebSocket', method: 'WS', path: '/ws/alarm',                        description: '告警推送（事件驱动）', params: '',                                  response: 'JSON: {type, data: Alarm, timestamp}' },
  { category: 'WebSocket', method: 'WS', path: '/api/drones/:id/telemetry',        description: '遥测数据推送（事件驱动）', params: 'id',                              response: 'JSON: {type, data: Telemetry, timestamp}' }
];

// GET /api/meta/endpoints
router.get('/endpoints', (req, res) => {
  success(res, ENDPOINTS, '获取接口元数据成功');
});

// GET /api/meta/health
router.get('/health', (req, res) => {
  success(res, { status: 'healthy', timestamp: new Date().toISOString() }, '服务运行正常');
});

module.exports = router;
