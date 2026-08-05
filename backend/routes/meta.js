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
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/return-home',       description: '一键返航',  params: 'id',                                      response: '{code:0, data: Drone}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/telemetry',         description: '实时遥测数据',       params: 'id',                                      response: '{code:0, data: {lat,lng,battery,signal,altitude,velocity}}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/telemetry',         description: '上报遥测数据（真实无人机接入）', params: 'id, {lat,lng,battery,altitude,speed,heading}', response: '{code:0, data: Telemetry}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/health',             description: '健康诊断',           params: 'id',                                      response: '{code:0, data: {droneId,overall,components}}' },
  { category: '飞控', method: 'POST',   path: '/api/drones/:id/fault',              description: '触发故障（模拟引擎）', params: 'id, {faultType}',                         response: '{code:0, data: {success,drone}}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/:id/fault',              description: '查询故障状态',       params: 'id',                                      response: '{code:0, data: {fault,status}}' },
  { category: '飞控', method: 'DELETE', path: '/api/drones/:id/fault',              description: '清除故障（恢复巡检）', params: 'id',                                      response: '{code:0, data: {cleared,emergencyCleared}}' },
  { category: '飞控', method: 'GET',    path: '/api/drones/fault-types/list',       description: '故障类型列表',       params: '',                                        response: '{code:0, data: [{value,label}]}' },
  { category: '飞控', method: 'GET',    path: '/api/geo-fences',                   description: '电子围栏列表',       params: '',                                        response: '{code:0, data: [GeoFence]}' },
  { category: '飞控', method: 'POST',   path: '/api/geo-fences',                   description: '创建电子围栏',       params: '{name, polygon, type}',                   response: '{code:0, data: GeoFence}' },
  { category: '飞控', method: 'DELETE', path: '/api/geo-fences/:id',               description: '删除电子围栏',       params: 'id',                                      response: '{code:0, data: GeoFence}' },

  // ---------- AI ----------
  { category: 'AI',   method: 'GET',    path: '/api/ai/models',                   description: 'AI 模型列表',         params: '',                                        response: '{code:0, data: [Model]}' },
  { category: 'AI',   method: 'POST',   path: '/api/ai/recognize',                  description: '图片识别（multipart 上传 image）', params: 'image(file)',                  response: '{code:0, data: {boxes, summary}}' },
  { category: 'AI',   method: 'POST',   path: '/api/ai/models/:id/deploy',         description: '模型下发（异步任务）', params: 'id',                                    response: '{code:0, data: {taskId, status}}' },
  { category: 'AI',   method: 'GET',    path: '/api/ai/models/:id/deploy/status',   description: '查询下发进度（自增）', params: 'id',                                   response: '{code:0, data: {taskId, progress, status}}' },

  // ---------- 业务 ----------
  { category: '业务', method: 'GET',    path: '/api/inspection-plans',             description: '巡检计划列表',       params: '',                                        response: '{code:0, data: [Plan]}' },
  { category: '业务', method: 'POST',   path: '/api/inspection-plans',             description: '创建巡检计划',       params: '{name, droneId, route, frequency, startTime}', response: '{code:0, data: Plan}' },
  { category: '业务', method: 'GET',    path: '/api/work-orders',                  description: '工单列表（支持 ?status=）', params: 'status?',                          response: '{code:0, data: [WorkOrder]}' },
  { category: '业务', method: 'PUT',    path: '/api/work-orders/:id',              description: '更新工单状态',       params: 'id, {status, assignee, opinion}',         response: '{code:0, data: WorkOrder}' },
  { category: '业务', method: 'GET',    path: '/api/alarms',                       description: '告警列表（支持 ?severity=&status=&droneId=）', params: 'severity?,status?,droneId?', response: '{code:0, data: [Alarm]}' },
  { category: '业务', method: 'POST',   path: '/api/alarms/upload',                  description: '批量上传告警（真实无人机接入）', params: '{alarms: [Alarm]}',                response: '{code:0, data: {total,uploaded}}' },
  { category: '业务', method: 'PUT',    path: '/api/alarms/:id',                    description: '更新告警状态',       params: 'id, {status}',                            response: '{code:0, data: Alarm}' },

  // ---------- 运维 ----------
  { category: '运维', method: 'POST',   path: '/api/auth/login',                   description: '用户登录',           params: '{username, password}',                    response: '{code:0, data: {token, user}}' },
  { category: '运维', method: 'POST',   path: '/api/auth/register',                description: '用户注册',           params: '{username, password, name?}',            response: '{code:0, data: {token, user}}' },
  { category: '运维', method: 'GET',    path: '/api/auth/me',                      description: '当前用户信息',       params: 'Authorization: Bearer <token>',           response: '{code:0, data: User}' },
  { category: '运维', method: 'GET',    path: '/api/audit-logs',                    description: '审计日志（支持 ?keyword=&startDate=&endDate=）', params: 'keyword?,startDate?,endDate?', response: '{code:0, data: [AuditLog]}' },

  // ---------- 元数据 ----------
  { category: '元数据', method: 'GET',  path: '/api/meta/endpoints',                description: '接口元数据',         params: '',                                        response: '{code:0, data: [Endpoint]}' },

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
