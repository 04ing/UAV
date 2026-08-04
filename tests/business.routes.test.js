/**
 * business 路由单元测试
 * 包含巡检计划、工单、告警的 CRUD 和状态流转
 */

const express = require('express');
const request = require('supertest');
const { plansRouter, workOrdersRouter, alarmsRouter } = require('../backend/routes/business');
const DataStore = require('../backend/data/dataStore');

// 创建测试 Express 应用
const app = express();
app.use(express.json());
app.use('/api/inspection-plans', plansRouter);
app.use('/api/work-orders', workOrdersRouter);
app.use('/api/alarms', alarmsRouter);

// 清理测试数据
function cleanupTestIds(ids, entity) {
  ids.forEach((id) => DataStore[entity].delete(id));
}

afterAll(() => {
  cleanupTestIds(
    DataStore.inspectionPlans.getAll().filter((p) => p.id.startsWith('TEST-')).map((p) => p.id),
    'inspectionPlans'
  );
  cleanupTestIds(
    DataStore.workOrders.getAll().filter((w) => w.id.startsWith('TEST-')).map((w) => w.id),
    'workOrders'
  );
  cleanupTestIds(
    DataStore.alarms.getAll().filter((a) => a.id.startsWith('TEST-')).map((a) => a.id),
    'alarms'
  );
});

/* ===================== 巡检计划 ===================== */
describe('巡检计划 API', () => {
  const testPlanIds = [];

  afterAll(() => cleanupTestIds(testPlanIds, 'inspectionPlans'));

  describe('POST /api/inspection-plans - 创建巡检计划', () => {
    test('应成功创建巡检计划', async () => {
      const res = await request(app)
        .post('/api/inspection-plans')
        .send({
          name: '测试巡检计划',
          droneId: 'DRONE-001',
          route: [{ lat: 30.5, lng: 114.3 }],
          frequency: 'weekly',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toMatch(/^PLAN-/);
      expect(res.body.data.name).toBe('测试巡检计划');
      expect(res.body.data.status).toBe('pending');
      testPlanIds.push(res.body.data.id);
    });

    test('缺少 name 应返回 400', async () => {
      const res = await request(app)
        .post('/api/inspection-plans')
        .send({ droneId: 'DRONE-001' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('name');
    });

    test('缺少 droneId 应返回 400', async () => {
      const res = await request(app)
        .post('/api/inspection-plans')
        .send({ name: '测试' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('droneId');
    });
  });

  describe('GET /api/inspection-plans - 获取列表', () => {
    test('应返回数组', async () => {
      const res = await request(app).get('/api/inspection-plans');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PUT /api/inspection-plans/:id - 更新计划', () => {
    test('应成功更新计划状态', async () => {
      // 先创建
      const createRes = await request(app)
        .post('/api/inspection-plans')
        .send({ name: '更新测试', droneId: 'DRONE-002' });
      testPlanIds.push(createRes.body.data.id);

      const res = await request(app)
        .put(`/api/inspection-plans/${createRes.body.data.id}`)
        .send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    test('更新不存在的计划应返回 404', async () => {
      const res = await request(app)
        .put('/api/inspection-plans/PLAN-NOT-EXIST')
        .send({ status: 'active' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/inspection-plans/:id - 删除计划', () => {
    test('应成功删除计划', async () => {
      const createRes = await request(app)
        .post('/api/inspection-plans')
        .send({ name: '删除测试', droneId: 'DRONE-003' });

      const res = await request(app).delete(`/api/inspection-plans/${createRes.body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createRes.body.data.id);
    });

    test('删除不存在的计划应返回 404', async () => {
      const res = await request(app).delete('/api/inspection-plans/PLAN-NOT-EXIST');
      expect(res.status).toBe(404);
    });
  });
});

/* ===================== 工单 ===================== */
describe('工单 API', () => {
  const testWoIds = [];

  afterAll(() => cleanupTestIds(testWoIds, 'workOrders'));

  describe('POST /api/work-orders - 创建工单', () => {
    test('应成功创建工单', async () => {
      const res = await request(app)
        .post('/api/work-orders')
        .send({
          title: '测试工单',
          assignee: '张三',
          description: '测试描述',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toMatch(/^WO-/);
      expect(res.body.data.status).toBe('pending');
      testWoIds.push(res.body.data.id);
    });

    test('缺少 title 应返回 400', async () => {
      const res = await request(app)
        .post('/api/work-orders')
        .send({ assignee: '李四' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('title');
    });
  });

  describe('GET /api/work-orders - 获取列表', () => {
    test('应返回数组', async () => {
      const res = await request(app).get('/api/work-orders');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('应支持按 status 过滤', async () => {
      const res = await request(app).get('/api/work-orders?status=pending');
      expect(res.status).toBe(200);
      expect(res.body.data.every((w) => w.status === 'pending')).toBe(true);
    });
  });

  describe('PUT /api/work-orders/:id - 状态流转', () => {
    test('应允许 pending → processing', async () => {
      const createRes = await request(app)
        .post('/api/work-orders')
        .send({ title: '状态流转测试' });
      testWoIds.push(createRes.body.data.id);

      const res = await request(app)
        .put(`/api/work-orders/${createRes.body.data.id}`)
        .send({ status: 'processing' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('processing');
    });

    test('应允许 processing → review → closed', async () => {
      const createRes = await request(app)
        .post('/api/work-orders')
        .send({ title: '完整流程测试' });
      testWoIds.push(createRes.body.data.id);

      await request(app)
        .put(`/api/work-orders/${createRes.body.data.id}`)
        .send({ status: 'processing' });

      const reviewRes = await request(app)
        .put(`/api/work-orders/${createRes.body.data.id}`)
        .send({ status: 'review' });
      expect(reviewRes.body.data.status).toBe('review');

      const closedRes = await request(app)
        .put(`/api/work-orders/${createRes.body.data.id}`)
        .send({ status: 'closed' });
      expect(closedRes.body.data.status).toBe('closed');
    });

    test('不允许状态回退 closed → pending', async () => {
      const createRes = await request(app)
        .post('/api/work-orders')
        .send({ title: '回退测试' });
      testWoIds.push(createRes.body.data.id);

      // 推进到 closed
      await request(app).put(`/api/work-orders/${createRes.body.data.id}`).send({ status: 'processing' });
      await request(app).put(`/api/work-orders/${createRes.body.data.id}`).send({ status: 'review' });
      await request(app).put(`/api/work-orders/${createRes.body.data.id}`).send({ status: 'closed' });

      // 尝试回退
      const res = await request(app)
        .put(`/api/work-orders/${createRes.body.data.id}`)
        .send({ status: 'pending' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('不允许状态回退');
    });

    test('非法状态应返回 400', async () => {
      const createRes = await request(app)
        .post('/api/work-orders')
        .send({ title: '非法状态测试' });
      testWoIds.push(createRes.body.data.id);

      const res = await request(app)
        .put(`/api/work-orders/${createRes.body.data.id}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('非法状态');
    });

    test('更新不存在的工单应返回 404', async () => {
      const res = await request(app)
        .put('/api/work-orders/WO-NOT-EXIST')
        .send({ status: 'processing' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/work-orders/:id - 删除工单', () => {
    test('应成功删除工单', async () => {
      const createRes = await request(app)
        .post('/api/work-orders')
        .send({ title: '删除测试' });

      const res = await request(app).delete(`/api/work-orders/${createRes.body.data.id}`);
      expect(res.status).toBe(200);
    });

    test('删除不存在的工单应返回 404', async () => {
      const res = await request(app).delete('/api/work-orders/WO-NOT-EXIST');
      expect(res.status).toBe(404);
    });
  });
});

/* ===================== 告警 ===================== */
describe('告警 API', () => {
  const testAlarmIds = [];

  afterAll(() => cleanupTestIds(testAlarmIds, 'alarms'));

  describe('POST /api/alarms/upload - 批量上传告警', () => {
    test('应成功上传告警', async () => {
      const res = await request(app)
        .post('/api/alarms/upload')
        .send({
          alarms: [
            {
              type: '低电量告警',
              severity: 'warning',
              droneId: 'DRONE-001',
              lat: 30.5,
              lng: 114.3,
              description: '电量低于25%',
            },
            {
              type: '电机故障',
              severity: 'critical',
              droneId: 'DRONE-002',
              lat: 30.6,
              lng: 114.4,
              description: '电机异常',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.total).toBe(2);
      testAlarmIds.push(...res.body.data.uploaded);
    });

    test('空数组应返回 400', async () => {
      const res = await request(app)
        .post('/api/alarms/upload')
        .send({ alarms: [] });

      expect(res.status).toBe(400);
    });

    test('非数组应返回 400', async () => {
      const res = await request(app)
        .post('/api/alarms/upload')
        .send({ alarms: 'not-an-array' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/alarms - 告警列表与过滤', () => {
    test('应返回数组', async () => {
      const res = await request(app).get('/api/alarms');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('应支持按 severity 过滤', async () => {
      const res = await request(app).get('/api/alarms?severity=critical');
      expect(res.status).toBe(200);
      expect(res.body.data.every((a) => a.severity === 'critical')).toBe(true);
    });

    test('应支持按 status 过滤', async () => {
      const res = await request(app).get('/api/alarms?status=pending');
      expect(res.status).toBe(200);
      expect(res.body.data.every((a) => a.status === 'pending')).toBe(true);
    });

    test('应支持按 droneId 过滤', async () => {
      const res = await request(app).get('/api/alarms?droneId=DRONE-001');
      expect(res.status).toBe(200);
      expect(res.body.data.every((a) => a.droneId === 'DRONE-001')).toBe(true);
    });

    test('应支持多条件组合过滤', async () => {
      const res = await request(app).get('/api/alarms?severity=warning&status=pending');
      expect(res.status).toBe(200);
      expect(res.body.data.every((a) => a.severity === 'warning' && a.status === 'pending')).toBe(true);
    });
  });

  describe('PUT /api/alarms/:id - 更新告警状态', () => {
    test('应成功更新告警状态', async () => {
      // 先上传一条告警
      const uploadRes = await request(app)
        .post('/api/alarms/upload')
        .send({
          alarms: [{
            type: '测试告警',
            severity: 'medium',
            droneId: 'DRONE-003',
            lat: 30.1,
            lng: 114.2,
          }],
        });
      testAlarmIds.push(...uploadRes.body.data.uploaded);
      const alarmId = uploadRes.body.data.uploaded[0];

      const res = await request(app)
        .put(`/api/alarms/${alarmId}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
    });

    test('更新不存在的告警应返回 404', async () => {
      const res = await request(app)
        .put('/api/alarms/ALARM-NOT-EXIST')
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/alarms/:id - 删除告警', () => {
    test('应成功删除告警', async () => {
      const uploadRes = await request(app)
        .post('/api/alarms/upload')
        .send({
          alarms: [{
            type: '删除测试',
            severity: 'low',
            droneId: 'DRONE-004',
            lat: 30.2,
            lng: 114.3,
          }],
        });

      const alarmId = uploadRes.body.data.uploaded[0];
      const res = await request(app).delete(`/api/alarms/${alarmId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(alarmId);
    });

    test('删除不存在的告警应返回 404', async () => {
      const res = await request(app).delete('/api/alarms/ALARM-NOT-EXIST');
      expect(res.status).toBe(404);
    });
  });
});
