// Task 5：业务工单 API
// 包含 /api/inspection-plans 与 /api/work-orders 两类路由

const express = require('express');
const mock = require('../data/mock');
const { success, error } = require('../utils/response');

// 内存缓存（Mock 写操作持久化）
const plansCache = mock.getInspectionPlans();
const workOrdersCache = mock.getWorkOrders();

// ---------- 巡检计划路由 ----------
const plansRouter = express.Router();

// GET /api/inspection-plans
plansRouter.get('/', (req, res) => {
  success(res, plansCache, '获取巡检计划列表成功');
});

// POST /api/inspection-plans —— 创建计划
plansRouter.post('/', (req, res) => {
  const { name, droneId, route, frequency, startTime } = req.body || {};
  if (!name || !droneId) {
    return error(res, '参数不合法：name、droneId 必填', 400);
  }
  const newPlan = {
    id: `PLAN-${String(plansCache.length + 1).padStart(3, '0')}`,
    name,
    droneId,
    route: Array.isArray(route) ? route : [],
    frequency: frequency || 'daily',
    startTime: startTime || new Date().toISOString(),
    status: 'pending'
  };
  plansCache.push(newPlan);
  success(res, newPlan, '巡检计划创建成功');
});

// ---------- 工单路由 ----------
const workOrdersRouter = express.Router();

// 工单状态流转：pending → processing → review → closed
const STATUS_FLOW = ['pending', 'processing', 'review', 'closed'];

// GET /api/work-orders —— 支持 ?status= 过滤
workOrdersRouter.get('/', (req, res) => {
  const { status } = req.query;
  let list = workOrdersCache;
  if (status) {
    list = workOrdersCache.filter((w) => w.status === status);
  }
  success(res, list, '获取工单列表成功');
});

// PUT /api/work-orders/:id —— 更新工单状态
workOrdersRouter.put('/:id', (req, res) => {
  const wo = workOrdersCache.find((w) => w.id === req.params.id);
  if (!wo) {
    return error(res, `未找到工单: ${req.params.id}`, 404);
  }
  const { status, assignee, opinion } = req.body || {};

  if (status) {
    // 校验状态合法性
    if (!STATUS_FLOW.includes(status)) {
      return error(res, `非法状态: ${status}，合法值: ${STATUS_FLOW.join(', ')}`, 400);
    }
    // 校验状态是否可以流转到目标状态（同状态或向前一步）
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

  success(res, wo, '工单更新成功');
});

module.exports = { plansRouter, workOrdersRouter };
