/**
 * AI 路由单元测试
 * 覆盖: GET /models, POST /recognize, POST /models/:id/deploy, GET /models/:id/deploy/status
 */

const express = require('express');
const request = require('supertest');
const aiRouter = require('../backend/routes/ai');

const app = express();
app.use(express.json());
app.use('/api/ai', aiRouter);

describe('AI 路由', () => {

  // ---------- GET /models ----------
  describe('GET /api/ai/models - AI 模型列表', () => {
    test('应返回模型数组', async () => {
      const res = await request(app).get('/api/ai/models');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('应包含 YOLOv8 模型', async () => {
      const res = await request(app).get('/api/ai/models');

      const model = res.body.data[0];
      expect(model.id).toBeDefined();
      expect(model.name).toContain('YOLO');
      expect(model.version).toBeDefined();
      expect(model.accuracy).toBeGreaterThan(0);
    });
  });

  // ---------- POST /recognize ----------
  describe('POST /api/ai/recognize - 图片识别', () => {
    test('未上传文件应返回 400', async () => {
      const res = await request(app)
        .post('/api/ai/recognize')
        .field('foo', 'bar');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.msg).toContain('未接收到图片文件');
    });

    test('字段名错误应返回 400', async () => {
      const res = await request(app)
        .post('/api/ai/recognize')
        .attach('wrong_field', Buffer.from('fake-image'), 'test.jpg');

      expect(res.status).toBe(400);
    });

    test('上传文件但 YOLO 服务未启动应返回 503', async () => {
      // YOLO 服务运行在 localhost:8080，测试环境中不应启动
      const res = await request(app)
        .post('/api/ai/recognize')
        .attach('file', Buffer.from('fake-image-data'), 'test.jpg');

      expect(res.status).toBe(503);
      expect(res.body.msg).toContain('AI 识别服务未启动');
    });
  });

  // ---------- POST /models/:id/deploy ----------
  describe('POST /api/ai/models/:id/deploy - 模型下发', () => {
    test('不存在的模型应返回 404', async () => {
      const res = await request(app)
        .post('/api/ai/models/mdl-not-exist/deploy');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });

    test('存在的模型应返回下发任务', async () => {
      const modelsRes = await request(app).get('/api/ai/models');
      const modelId = modelsRes.body.data[0].id;

      const res = await request(app)
        .post(`/api/ai/models/${modelId}/deploy`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.taskId).toMatch(/^TASK-/);
      expect(res.body.data.status).toBe('deploying');
    });
  });

  // ---------- GET /models/:id/deploy/status ----------
  describe('GET /api/ai/models/:id/deploy/status - 下发进度', () => {
    test('无下发任务应返回 404', async () => {
      const res = await request(app)
        .get('/api/ai/models/mdl-not-exist/deploy/status');

      expect(res.status).toBe(404);
    });

    test('有下发任务应返回进度（每次自增 10）', async () => {
      // 先创建下发任务
      const modelsRes = await request(app).get('/api/ai/models');
      const modelId = modelsRes.body.data[0].id;

      await request(app).post(`/api/ai/models/${modelId}/deploy`);

      // 第一次查询
      const res1 = await request(app).get(`/api/ai/models/${modelId}/deploy/status`);
      expect(res1.status).toBe(200);
      expect(res1.body.data.progress).toBeGreaterThanOrEqual(10);
      expect(res1.body.data.status).toBe('deploying');

      // 第二次查询（进度应增加）
      const res2 = await request(app).get(`/api/ai/models/${modelId}/deploy/status`);
      expect(res2.body.data.progress).toBeGreaterThan(res1.body.data.progress);
    });

    test('进度达到 100 应标记为 done', async () => {
      const modelsRes = await request(app).get('/api/ai/models');
      const modelId = modelsRes.body.data[0].id;

      // 创建任务
      await request(app).post(`/api/ai/models/${modelId}/deploy`);

      // 连续查询直到完成（10次 × 10% = 100%）
      let lastRes;
      for (let i = 0; i < 12; i++) {
        lastRes = await request(app).get(`/api/ai/models/${modelId}/deploy/status`);
        if (lastRes.body.data.status === 'done') break;
      }

      expect(lastRes.body.data.progress).toBe(100);
      expect(lastRes.body.data.status).toBe('done');

      // 验证模型状态已更新为 deployed
      const modelsRes2 = await request(app).get('/api/ai/models');
      const model = modelsRes2.body.data.find((m) => m.id === modelId);
      expect(model.edgeStatus).toBe('deployed');
    });
  });
});
