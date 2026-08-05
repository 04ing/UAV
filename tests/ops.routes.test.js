/**
 * Ops 路由单元测试
 * 覆盖: auth(login/me/logout/users CRUD), auditLogs(列表/过滤/分页)
 */

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const DataStore = require('../backend/data/dataStore');
const { signToken } = require('../backend/middleware/auth');
const { authRouter, auditLogsRouter } = require('../backend/routes/ops');

// 构建测试 App：requireAuth 在 authRouter 之前，使 /me、/users 等受保护
// /api/auth/login 在 WHITELIST 中，仍可无 Token 访问
const app = express();
app.use(express.json());

const { requireAuth } = require('../backend/middleware/auth');

// 全局鉴权中间件（先于路由挂载，login 在 WHITELIST 中放行）
app.use(requireAuth);
app.use('/api/auth', authRouter);
app.use('/api/audit-logs', auditLogsRouter);

// ============ 常量 ============
const TEST_USER = {
  username: 'test_user_ops',
  password: 'Test@1234',
  role: 'admin',
  name: '测试用户',
};
let token;

// ============ 前置/后置 ============
const CLEANUP_USERNAMES = [
  'test_user_ops',
  'plain_user_test',
  'new_user_test',
  'bcrypt_test_user',
  'test',
  'test_no_pass',
  'test_no_role',
];

function cleanupTestUsers() {
  const users = DataStore.users.getAll();
  users.forEach((u) => {
    if (CLEANUP_USERNAMES.includes(u.username)) {
      DataStore.users.delete(u.id);
    }
  });
}

beforeAll(async () => {
  // 清理上次测试遗留的用户数据
  cleanupTestUsers();

  // 创建测试用户
  let user = DataStore.users.getByUsername(TEST_USER.username);
  if (!user) {
    const hash = await bcrypt.hash(TEST_USER.password, 10);
    user = {
      id: `USER-TEST-${Date.now()}`,
      username: TEST_USER.username,
      password: hash,
      role: TEST_USER.role,
      name: TEST_USER.name,
    };
    DataStore.users.add(user);
  }
  token = signToken({ id: user.id, username: user.username, role: user.role, name: user.name });
});

afterAll(() => {
  cleanupTestUsers();
});

// ============ 测试用例 ============

describe('Ops 路由 - 认证模块', () => {

  // ---------- POST /login ----------
  describe('POST /api/auth/login - 用户登录', () => {
    test('正确密码应返回 Token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.username).toBe('admin');
      expect(res.body.data.user.id).toBeDefined();
      expect(res.body.data.user.role).toBeDefined();
    });

    test('错误密码应返回 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong_password' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1);
      expect(res.body.msg).toContain('错误');
    });

    test('不存在的用户应返回 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'no_such_user', password: 'whatever' });

      expect(res.status).toBe(401);
    });

    test('缺少 username 应返回 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'admin123' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('必填');
    });

    test('缺少 password 应返回 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin' });

      expect(res.status).toBe(400);
    });

    test('空 body 应返回 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });

    test('明文密码登录后应自动升级为 bcrypt 哈希', async () => {
      // 创建一个明文密码用户
      const plainUser = {
        id: `USER-PLAIN-${Date.now()}`,
        username: 'plain_user_test',
        password: 'plainPass123',
        role: 'viewer',
        name: '明文测试',
      };
      DataStore.users.add(plainUser);

      // 用明文密码登录
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'plain_user_test', password: 'plainPass123' });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();

      // 验证密码已升级为 bcrypt
      const updated = DataStore.users.getByUsername('plain_user_test');
      expect(updated.password.length).toBeGreaterThanOrEqual(60);
      expect(updated.password.startsWith('$2b$')).toBe(true);

      // 清理
      DataStore.users.delete(plainUser.id);
    });
  });

  // ---------- GET /me ----------
  describe('GET /api/auth/me - 当前用户信息', () => {
    test('携带 Token 应返回用户信息', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.username).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.role).toBeDefined();
    });

    test('无 Token 应返回 401', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });
  });

  // ---------- POST /logout ----------
  describe('POST /api/auth/logout - 退出登录', () => {
    test('应成功退出并记录审计日志', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });
  });

  // ---------- GET /users ----------
  describe('GET /api/auth/users - 用户列表', () => {
    test('应返回用户数组（不含密码）', async () => {
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // 确保不返回密码字段
      res.body.data.forEach((u) => {
        expect(u).not.toHaveProperty('password');
        expect(u).toHaveProperty('id');
        expect(u).toHaveProperty('username');
        expect(u).toHaveProperty('role');
        expect(u.status).toBe('enabled');
      });
    });

    test('无 Token 应返回 401', async () => {
      const res = await request(app).get('/api/auth/users');
      expect(res.status).toBe(401);
    });
  });

  // ---------- POST /users ----------
  describe('POST /api/auth/users - 创建用户', () => {
    test('应成功创建新用户', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'new_user_test',
          password: 'NewUser@123',
          role: 'viewer',
          name: '新建测试用户',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toMatch(/^USER-/);
      expect(res.body.data.username).toBe('new_user_test');
      expect(res.body.data.role).toBe('viewer');

      // 清理
      DataStore.users.delete(res.body.data.id);
    });

    test('用户名已存在应返回 400', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'admin',  // 已存在的用户名
          password: 'whatever',
          role: 'viewer',
        });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('已存在');
    });

    test('缺少 username 应返回 400', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'test', role: 'viewer' });

      expect(res.status).toBe(400);
    });

    test('缺少 password 应返回 400', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'test_no_pass', role: 'viewer' });

      expect(res.status).toBe(400);
    });

    test('缺少 role 应返回 400', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'test_no_role', password: 'test' });

      expect(res.status).toBe(400);
    });

    test('无 Token 应返回 401', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .send({ username: 'test', password: 'test', role: 'viewer' });

      expect(res.status).toBe(401);
    });

    test('新用户密码应为 bcrypt 哈希', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'bcrypt_test_user',
          password: 'BcryptTest@1',
          role: 'viewer',
        });

      const user = DataStore.users.getByUsername('bcrypt_test_user');
      expect(user.password.startsWith('$2b$')).toBe(true);
      expect(user.password.length).toBeGreaterThanOrEqual(60);

      // 清理
      DataStore.users.delete(res.body.data.id);
    });
  });
});


describe('Ops 路由 - 审计日志模块', () => {

  // ---------- GET / (列表+过滤+分页) ----------
  describe('GET /api/audit-logs - 审计日志', () => {
    test('应返回分页结构 {total, page, pageSize, items}', async () => {
      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('pageSize');
      expect(res.body.data).toHaveProperty('items');
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    test('默认分页 page=1, pageSize=20', async () => {
      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(20);
    });

    test('自定义分页 page=2, pageSize=5', async () => {
      // 先添加足够多的日志
      for (let i = 0; i < 6; i++) {
        DataStore.auditLogs.add({
          id: `LOG-TEST-${Date.now()}-${i}`,
          user: 'admin',
          action: 'test_action',
          target: '-',
          ip: '127.0.0.1',
          timestamp: new Date().toISOString(),
        });
      }

      const res = await request(app)
        .get('/api/audit-logs?page=2&pageSize=5')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.page).toBe(2);
      expect(res.body.data.pageSize).toBe(5);
      expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    });

    test('keyword 过滤 - 按用户名过滤', async () => {
      DataStore.auditLogs.add({
        id: `LOG-KW-${Date.now()}`,
        user: 'keyword_test_user',
        action: 'login',
        target: '-',
        ip: '127.0.0.1',
        timestamp: new Date().toISOString(),
      });

      const res = await request(app)
        .get('/api/audit-logs?keyword=keyword_test')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.items.some((l) => l.user.includes('keyword_test'))
      ).toBe(true);
    });

    test('keyword 过滤 - 按 action 过滤', async () => {
      DataStore.auditLogs.add({
        id: `LOG-ACT-${Date.now()}`,
        user: 'admin',
        action: 'special_action_xyz',
        target: '-',
        ip: '127.0.0.1',
        timestamp: new Date().toISOString(),
      });

      const res = await request(app)
        .get('/api/audit-logs?keyword=special_action_xyz')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.items.some((l) => l.action.includes('special_action_xyz'))
      ).toBe(true);
    });

    test('startDate 过滤 - 只返回之后的日志', async () => {
      // 添加一条旧日志
      DataStore.auditLogs.add({
        id: `LOG-OLD-${Date.now()}`,
        user: 'admin',
        action: 'old_action',
        target: '-',
        ip: '127.0.0.1',
        timestamp: '2020-01-01T00:00:00.000Z',
      });

      const res = await request(app)
        .get('/api/audit-logs?startDate=2025-01-01')
        .set('Authorization', `Bearer ${token}`);

      // 不应包含 2020 年的日志
      expect(
        res.body.data.items.every((l) => new Date(l.timestamp).getTime() >= new Date('2025-01-01').getTime())
      ).toBe(true);
    });

    test('endDate 过滤 - 只返回之前的日志', async () => {
      const res = await request(app)
        .get('/api/audit-logs?endDate=2025-01-01')
        .set('Authorization', `Bearer ${token}`);

      expect(
        res.body.data.items.every((l) => new Date(l.timestamp).getTime() <= new Date('2025-01-01').getTime())
      ).toBe(true);
    });

    test('组合过滤 startDate + endDate + keyword', async () => {
      const res = await request(app)
        .get('/api/audit-logs?startDate=2020-01-01&endDate=2030-12-31&keyword=admin')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((l) => {
        const ts = new Date(l.timestamp).getTime();
        return ts >= new Date('2020-01-01').getTime() && ts <= new Date('2030-12-31').getTime();
      })).toBe(true);
    });

    test('无 Token 应返回 401', async () => {
      const res = await request(app).get('/api/audit-logs');
      expect(res.status).toBe(401);
    });

    test('无效 startDate 不影响查询', async () => {
      const res = await request(app)
        .get('/api/audit-logs?startDate=invalid-date')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // 无效日期应被忽略，返回所有日志
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });
  });
});
