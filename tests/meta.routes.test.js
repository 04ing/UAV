/**
 * Meta 路由单元测试
 * 覆盖: GET /endpoints, GET /health
 */

const express = require('express');
const request = require('supertest');
const metaRouter = require('../backend/routes/meta');

const app = express();
app.use(express.json());
app.use('/api/meta', metaRouter);

describe('Meta 路由', () => {

  // ---------- GET /endpoints ----------
  describe('GET /api/meta/endpoints - 接口元数据', () => {
    test('应返回端点数组', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('端点应包含所有必要字段', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      const ep = res.body.data[0];
      expect(ep).toHaveProperty('category');
      expect(ep).toHaveProperty('method');
      expect(ep).toHaveProperty('path');
      expect(ep).toHaveProperty('description');
      expect(ep).toHaveProperty('params');
      expect(ep).toHaveProperty('response');
    });

    test('应包含飞控类别接口', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      const flyCtrl = res.body.data.filter((e) => e.category === '飞控');
      expect(flyCtrl.length).toBeGreaterThanOrEqual(10);
      const paths = flyCtrl.map((e) => e.path);
      expect(paths).toContain('/api/drones');
      expect(paths).toContain('/api/drones/:id');
      expect(paths).toContain('/api/drones/:id/telemetry');
      expect(paths).toContain('/api/drones/:id/fault');
    });

    test('应包含故障注入系列接口', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      const faultEps = res.body.data.filter(
        (e) => e.path.includes('/fault') || e.path.includes('fault-types')
      );
      expect(faultEps.length).toBeGreaterThanOrEqual(4);

      const methods = faultEps.map((e) => e.method);
      expect(methods).toContain('POST');
      expect(methods).toContain('GET');
      expect(methods).toContain('DELETE');
    });

    test('应包含 AI 类别接口', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      const ai = res.body.data.filter((e) => e.category === 'AI');
      expect(ai.length).toBeGreaterThanOrEqual(4);
    });

    test('应包含 WebSocket 通道', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      const ws = res.body.data.filter((e) => e.category === 'WebSocket');
      expect(ws.length).toBeGreaterThanOrEqual(3);
      const wsPaths = ws.map((e) => e.path);
      expect(wsPaths).toContain('/ws/video');
      expect(wsPaths).toContain('/ws/alarm');
    });

    test('应包含业务和运维类别', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      const categories = res.body.data.map((e) => e.category);
      expect(categories).toContain('业务');
      expect(categories).toContain('运维');
      expect(categories).toContain('元数据');
    });

    test('HTTP 方法应合法', async () => {
      const res = await request(app).get('/api/meta/endpoints');

      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'WS'];
      res.body.data.forEach((ep) => {
        expect(validMethods).toContain(ep.method);
      });
    });

    test('接口总数应 ≥ 25', async () => {
      const res = await request(app).get('/api/meta/endpoints');
      expect(res.body.data.length).toBeGreaterThanOrEqual(25);
    });
  });

  // ---------- GET /health ----------
  describe('GET /api/meta/health - 健康探针', () => {
    test('应返回 healthy 状态', async () => {
      const res = await request(app).get('/api/meta/health');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('healthy');
    });

    test('应包含 ISO 时间戳', async () => {
      const res = await request(app).get('/api/meta/health');

      expect(res.body.data.timestamp).toBeDefined();
      const date = new Date(res.body.data.timestamp);
      expect(date.toString()).not.toBe('Invalid Date');
    });
  });
});
