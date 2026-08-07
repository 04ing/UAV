const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const DataStore = require('../data/dataStore');
const { success, error } = require('../utils/response');
const { signToken, requireRole } = require('../middleware/auth');

const authRouter = express.Router();

authRouter.post('/register', async (req, res) => {
  const { username, password, name } = req.body || {};

  // 参数校验
  if (!username || !password) {
    return error(res, '用户名和密码必填', 400);
  }
  if (username.length < 3) {
    return error(res, '用户名至少 3 个字符', 400);
  }
  if (password.length < 6) {
    return error(res, '密码至少 6 个字符', 400);
  }

  // 检查用户名是否已存在
  if (DataStore.users.getByUsername(username)) {
    return error(res, '用户名已存在', 400);
  }

  // 创建用户（默认 viewer 角色）
  const hash = await bcrypt.hash(password, 10);
  const users = DataStore.users.getAll();
  const newUser = {
    id: `USER-${String(users.length + 1).padStart(3, '0')}`,
    username,
    password: hash,
    role: 'viewer',
    name: name || username,
    createdAt: new Date().toISOString()
  };

  DataStore.users.add(newUser);

  // 自动签发 token，注册后无需再次登录
  const token = signToken({
    id: newUser.id,
    username: newUser.username,
    role: newUser.role,
    name: newUser.name
  });

  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: newUser.username,
    action: 'register',
    target: newUser.id,
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  success(res, {
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      name: newUser.name
    }
  }, '注册成功');
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return error(res, '用户名和密码必填', 400);
  }
  
  const user = DataStore.users.getByUsername(username);
  if (!user) {
    return error(res, '用户名或密码错误', 401);
  }

  let isValid = false;
  const isBcryptHash = user.password.length >= 60 && user.password.startsWith('$2b$');
  if (isBcryptHash) {
    isValid = await bcrypt.compare(password, user.password);
  } else {
    isValid = user.password === password;
    if (isValid) {
      const hash = await bcrypt.hash(password, 10);
      DataStore.users.update(user.id, { password: hash });
    }
  }

  if (!isValid) {
    return error(res, '用户名或密码错误', 401);
  }
  
  const token = signToken({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name
  });
  
  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: user.username,
    action: 'login',
    target: '-',
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  success(res, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    }
  }, '登录成功');
});

authRouter.get('/me', (req, res) => {
  const user = DataStore.users.getById(req.user.id);
  if (!user) {
    return error(res, '用户不存在', 404);
  }
  success(res, {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt || null
  }, '获取当前用户信息成功');
});

authRouter.put('/me', (req, res) => {
  const user = DataStore.users.getById(req.user.id);
  if (!user) {
    return error(res, '用户不存在', 404);
  }

  const { name } = req.body || {};
  const updates = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return error(res, '姓名不能为空', 400);
    }
    updates.name = name.trim();
  }

  if (Object.keys(updates).length === 0) {
    return error(res, '没有可更新的字段', 400);
  }

  const updated = DataStore.users.update(user.id, updates);
  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: req.user.username,
    action: 'update_profile',
    target: user.id,
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  // 重新签发 token 以更新 name
  const newToken = signToken({
    id: updated.id,
    username: updated.username,
    role: updated.role,
    name: updated.name
  });

  success(res, {
    id: updated.id,
    username: updated.username,
    name: updated.name,
    role: updated.role,
    token: newToken
  }, '个人信息更新成功');
});

authRouter.put('/me/password', async (req, res) => {
  const user = DataStore.users.getById(req.user.id);
  if (!user) {
    return error(res, '用户不存在', 404);
  }

  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return error(res, '旧密码和新密码必填', 400);
  }
  if (newPassword.length < 6) {
    return error(res, '新密码至少 6 个字符', 400);
  }
  if (oldPassword === newPassword) {
    return error(res, '新密码不能与旧密码相同', 400);
  }

  // 验证旧密码
  const isBcryptHash = user.password.length >= 60 && user.password.startsWith('$2b$');
  let valid = false;
  if (isBcryptHash) {
    valid = await bcrypt.compare(oldPassword, user.password);
  } else {
    valid = user.password === oldPassword;
  }

  if (!valid) {
    return error(res, '旧密码不正确', 401);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  DataStore.users.update(user.id, { password: hash });

  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: req.user.username,
    action: 'change_password',
    target: user.id,
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  success(res, {}, '密码修改成功');
});

authRouter.post('/logout', (req, res) => {
  if (req.user && req.user.username) {
    DataStore.auditLogs.add({
      id: `LOG-${String(Date.now()).slice(-6)}`,
      user: req.user.username,
      action: 'logout',
      target: '-',
      ip: req.ip || '-',
      timestamp: new Date().toISOString()
    });
  }
  success(res, {}, '退出成功');
});

authRouter.get('/users', (req, res) => {
  const users = DataStore.users.getAll().map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    status: 'enabled'
  }));
  success(res, users, '获取用户列表成功');
});

authRouter.post('/users', requireRole('admin'), async (req, res) => {
  const { username, password, role, name } = req.body || {};
  
  if (!username || !password || !role) {
    return error(res, '参数不合法：username、password、role 必填', 400);
  }
  
  if (DataStore.users.getByUsername(username)) {
    return error(res, '用户名已存在', 400);
  }
  
  const hash = await bcrypt.hash(password, 10);
  const users = DataStore.users.getAll();
  const newUser = {
    id: `USER-${String(users.length + 1).padStart(3, '0')}`,
    username,
    password: hash,
    role: role || 'viewer',
    name: name || username
  };
  
  DataStore.users.add(newUser);
  
  if (req.user && req.user.username) {
    DataStore.auditLogs.add({
      id: `LOG-${String(Date.now()).slice(-6)}`,
      user: req.user.username,
      action: 'create_user',
      target: newUser.id,
      ip: req.ip || '-',
      timestamp: new Date().toISOString()
    });
  }

  success(res, newUser, '用户创建成功');
});

/* 更新用户角色 */
authRouter.put('/users/:id', requireRole('admin'), (req, res) => {
  const user = DataStore.users.getById(req.params.id);
  if (!user) {
    return error(res, `未找到用户: ${req.params.id}`, 404);
  }

  const { role, name, status } = req.body || {};
  const updates = {};

  if (role !== undefined) {
    const validRoles = ['admin', 'operator', 'viewer'];
    if (!validRoles.includes(role)) {
      return error(res, `无效的角色: ${role}，可选值: ${validRoles.join(', ')}`, 400);
    }
    updates.role = role;
  }
  if (name !== undefined) {
    updates.name = name;
  }
  if (status !== undefined) {
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    return error(res, '没有可更新的字段', 400);
  }

  const updated = DataStore.users.update(user.id, updates);

  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: (req.user && req.user.username) || 'system',
    action: 'update_user',
    target: user.id,
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  success(res, {
    id: updated.id,
    username: updated.username,
    name: updated.name,
    role: updated.role,
    status: updated.status || 'enabled'
  }, '用户更新成功');
});

/* 删除用户 */
authRouter.delete('/users/:id', requireRole('admin'), (req, res) => {
  const user = DataStore.users.getById(req.params.id);
  if (!user) {
    return error(res, `未找到用户: ${req.params.id}`, 404);
  }

  // 不允许删除自己
  if (req.user && req.user.id === user.id) {
    return error(res, '不允许删除当前登录用户', 400);
  }

  // 不允许删除最后一个管理员
  if (user.role === 'admin') {
    const admins = DataStore.users.getAll().filter(u => u.role === 'admin');
    if (admins.length <= 1) {
      return error(res, '不允许删除最后一个管理员账户', 400);
    }
  }

  DataStore.users.delete(user.id);

  DataStore.auditLogs.add({
    id: `LOG-${String(Date.now()).slice(-6)}`,
    user: (req.user && req.user.username) || 'system',
    action: 'delete_user',
    target: user.id,
    ip: req.ip || '-',
    timestamp: new Date().toISOString()
  });

  success(res, { id: user.id, deleted: true }, '用户已删除');
});

/* ========== 数据备份与恢复 API ========== */

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');

// 确保备份目录存在
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// 数据备份路由
const backupRouter = express.Router();

/* 创建数据备份 */
backupRouter.post('/', requireRole('admin'), (req, res) => {
  try {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_${timestamp}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // 收集所有数据
    const backupData = {
      metadata: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        createdBy: (req.user && req.user.username) || 'system'
      },
      drones: DataStore.drones.getAll(),
      alarms: DataStore.alarms.getAll(),
      workOrders: DataStore.workOrders.getAll(),
      inspectionPlans: DataStore.inspectionPlans.getAll(),
      auditLogs: DataStore.auditLogs.getAll(),
      geoFences: DataStore.geoFences.getAll(),
      users: DataStore.users.getAll().map(u => ({
        id: u.id,
        username: u.username,
        password: u.password,
        role: u.role,
        name: u.name,
        createdAt: u.createdAt
      }))
    };

    // 写入备份文件（先写临时文件再重命名，确保原子性）
    const tempPath = backupPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(backupData, null, 2), 'utf-8');
    fs.renameSync(tempPath, backupPath);

    // 记录审计日志
    DataStore.auditLogs.add({
      id: `LOG-${String(Date.now()).slice(-6)}`,
      user: (req.user && req.user.username) || 'system',
      action: 'data_backup',
      target: backupFileName,
      ip: req.ip || '-',
      timestamp: new Date().toISOString()
    });

    const stats = fs.statSync(backupPath);
    success(res, {
      fileName: backupFileName,
      size: stats.size,
      createdAt: backupData.metadata.createdAt,
      recordCounts: {
        drones: backupData.drones.length,
        alarms: backupData.alarms.length,
        workOrders: backupData.workOrders.length,
        inspectionPlans: backupData.inspectionPlans.length,
        auditLogs: backupData.auditLogs.length,
        geoFences: backupData.geoFences.length,
        users: backupData.users.length
      }
    }, '数据备份成功');
  } catch (err) {
    console.error('[backup] 备份失败:', err);
    return error(res, '数据备份失败: ' + err.message, 500);
  }
});

/* 获取备份列表 */
backupRouter.get('/', (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
    const backups = files.map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        fileName: f,
        size: stats.size,
        createdAt: stats.mtime.toISOString()
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    success(res, backups, '获取备份列表成功');
  } catch (err) {
    console.error('[backup] 获取备份列表失败:', err);
    return error(res, '获取备份列表失败: ' + err.message, 500);
  }
});

/* 删除备份 */
backupRouter.delete('/:fileName', requireRole('admin'), (req, res) => {
  try {
    const fileName = path.basename(req.params.fileName);
    const backupPath = path.join(BACKUP_DIR, fileName);

    if (!fs.existsSync(backupPath)) {
      return error(res, `未找到备份文件: ${fileName}`, 404);
    }

    fs.unlinkSync(backupPath);

    DataStore.auditLogs.add({
      id: `LOG-${String(Date.now()).slice(-6)}`,
      user: (req.user && req.user.username) || 'system',
      action: 'delete_backup',
      target: fileName,
      ip: req.ip || '-',
      timestamp: new Date().toISOString()
    });

    success(res, { fileName, deleted: true }, '备份已删除');
  } catch (err) {
    console.error('[backup] 删除备份失败:', err);
    return error(res, '删除备份失败: ' + err.message, 500);
  }
});

const auditLogsRouter = express.Router();

auditLogsRouter.get('/', (req, res) => {
  const { keyword, startDate, endDate, page, pageSize } = req.query;
  let list = DataStore.auditLogs.getAll();

  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((log) => {
      return (
        (log.user && log.user.toLowerCase().includes(kw)) ||
        (log.action && log.action.toLowerCase().includes(kw)) ||
        (log.target && log.target.toLowerCase().includes(kw)) ||
        (log.id && log.id.toLowerCase().includes(kw))
      );
    });
  }

  if (startDate) {
    const start = new Date(startDate).getTime();
    if (!Number.isNaN(start)) {
      list = list.filter((log) => new Date(log.timestamp).getTime() >= start);
    }
  }

  if (endDate) {
    const end = new Date(endDate).getTime();
    if (!Number.isNaN(end)) {
      list = list.filter((log) => new Date(log.timestamp).getTime() <= end);
    }
  }

  const total = list.length;
  const currentPage = parseInt(page) || 1;
  const size = parseInt(pageSize) || 20;
  const startIdx = (currentPage - 1) * size;
  const paginated = list.slice(startIdx, startIdx + size);

  success(res, {
    total,
    page: currentPage,
    pageSize: size,
    items: paginated
  }, '获取审计日志成功');
});

module.exports = { authRouter, auditLogsRouter, backupRouter };