const express = require('express');
const DataStore = require('../data/dataStore');
const { success, error } = require('../utils/response');

const plansRouter = express.Router();

plansRouter.get('/', (req, res) => {
  const plans = DataStore.inspectionPlans.getAll();
  success(res, plans, '获取巡检计划列表成功');
});

plansRouter.post('/', (req, res) => {
  const { name, droneId, route, frequency, startTime } = req.body || {};
  if (!name || !droneId) {
    return error(res, '参数不合法：name、droneId 必填', 400);
  }
  
  const plans = DataStore.inspectionPlans.getAll();
  const newPlan = {
    id: `PLAN-${String(plans.length + 1).padStart(3, '0')}`,
    name,
    droneId,
    route: Array.isArray(route) ? route : [],
    frequency: frequency || 'daily',
    startTime: startTime || new Date().toISOString(),
    status: 'pending'
  };

  DataStore.inspectionPlans.add(newPlan);
  success(res, newPlan, '巡检计划创建成功');
});

plansRouter.put('/:id', (req, res) => {
  const { status } = req.body || {};
  const plan = DataStore.inspectionPlans.getById(req.params.id);
  
  if (!plan) {
    return error(res, `未找到巡检计划: ${req.params.id}`, 404);
  }

  if (status) {
    plan.status = status;
    plan.updatedAt = new Date().toISOString();
    DataStore.inspectionPlans.update(req.params.id, plan);
  }

  success(res, plan, '巡检计划更新成功');
});

plansRouter.delete('/:id', (req, res) => {
  const removed = DataStore.inspectionPlans.delete(req.params.id);
  if (!removed) {
    return error(res, `未找到巡检计划: ${req.params.id}`, 404);
  }
  success(res, removed, '巡检计划已删除');
});

const workOrdersRouter = express.Router();

const STATUS_FLOW = ['pending', 'processing', 'review', 'closed'];

workOrdersRouter.get('/', (req, res) => {
  const { status } = req.query;
  let list = DataStore.workOrders.getAll();
  
  if (status) {
    list = list.filter((w) => w.status === status);
  }
  
  success(res, list, '获取工单列表成功');
});

workOrdersRouter.post('/', (req, res) => {
  const { alarmId, title, assignee, description } = req.body || {};
  
  if (!title) {
    return error(res, '参数不合法：title 必填', 400);
  }
  
  const orders = DataStore.workOrders.getAll();
  const newOrder = {
    id: `WO-${String(orders.length + 1).padStart(3, '0')}`,
    alarmId: alarmId || '-',
    title,
    status: 'pending',
    assignee: assignee || '-',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description: description || ''
  };

  DataStore.workOrders.add(newOrder);
  success(res, newOrder, '工单创建成功');
});

workOrdersRouter.put('/:id', (req, res) => {
  const wo = DataStore.workOrders.getById(req.params.id);
  if (!wo) {
    return error(res, `未找到工单: ${req.params.id}`, 404);
  }
  
  const { status, assignee, opinion } = req.body || {};

  if (status) {
    if (!STATUS_FLOW.includes(status)) {
      return error(res, `非法状态: ${status}，合法值: ${STATUS_FLOW.join(', ')}`, 400);
    }
    const currentIdx = STATUS_FLOW.indexOf(wo.status);
    const targetIdx = STATUS_FLOW.indexOf(status);
    if (targetIdx < currentIdx) {
      return error(res, `不允许状态回退: ${wo.status} → ${status}`, 400);
    }
    wo.status = status;
  }

  if (assignee !== undefined) {
    wo.assignee = assignee;
  }
  if (opinion !== undefined) {
    wo.opinion = opinion;
  }
  wo.updatedAt = new Date().toISOString();

  DataStore.workOrders.update(req.params.id, wo);
  success(res, wo, '工单更新成功');
});

workOrdersRouter.delete('/:id', (req, res) => {
  const removed = DataStore.workOrders.delete(req.params.id);
  if (!removed) {
    return error(res, `未找到工单: ${req.params.id}`, 404);
  }
  success(res, removed, '工单已删除');
});

const alarmsRouter = express.Router();

alarmsRouter.get('/', (req, res) => {
  const { status, severity, type } = req.query;
  let list = DataStore.alarms.getAll();
  
  if (status) {
    list = list.filter((a) => a.status === status);
  }
  if (severity) {
    list = list.filter((a) => a.severity === severity);
  }
  if (type) {
    list = list.filter((a) => a.type === type);
  }
  
  success(res, list, '获取告警列表成功');
});

alarmsRouter.post('/upload', (req, res) => {
  const { alarms } = req.body || {};
  
  if (!Array.isArray(alarms) || alarms.length === 0) {
    return error(res, '参数不合法：alarms 必须是数组且至少包含一个告警数据', 400);
  }

  const uploaded = [];

  for (const alarmData of alarms) {
    const { type, severity, droneId, lat, lng, imageBase64, description } = alarmData;
    
    if (!type || !droneId || lat === undefined || lng === undefined) {
      continue;
    }

    const alarms = DataStore.alarms.getAll();
    const newAlarm = {
      id: `ALARM-${String(alarms.length + 1).padStart(3, '0')}`,
      type,
      severity: severity || 'medium',
      droneId,
      lat,
      lng,
      timestamp: new Date().toISOString(),
      status: 'pending',
      imageBase64: imageBase64 || null,
      description: description || ''
    };

    DataStore.alarms.add(newAlarm);
    uploaded.push(newAlarm.id);
  }

  success(res, { uploaded, total: uploaded.length }, 
    `成功上传 ${uploaded.length} 条告警数据`);
});

alarmsRouter.put('/:id', (req, res) => {
  const { status } = req.body || {};
  const alarm = DataStore.alarms.getById(req.params.id);
  
  if (!alarm) {
    return error(res, `未找到告警: ${req.params.id}`, 404);
  }

  if (status) {
    alarm.status = status;
    DataStore.alarms.update(req.params.id, alarm);
  }

  success(res, alarm, '告警状态更新成功');
});

alarmsRouter.delete('/:id', (req, res) => {
  const removed = DataStore.alarms.delete(req.params.id);
  if (!removed) {
    return error(res, `未找到告警: ${req.params.id}`, 404);
  }
  success(res, removed, '告警已删除');
});

module.exports = { plansRouter, workOrdersRouter, alarmsRouter };