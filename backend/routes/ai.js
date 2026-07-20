// Task 4：AI 识别 API
// 提供模型列表、图片识别、模型下发与下发进度查询

const express = require('express');
const multer = require('multer');
const mock = require('../data/mock');
const { success, error } = require('../utils/response');

const router = express.Router();

// 内存缓存模型数据（保证 deploy 状态变化持久化）
const modelsCache = mock.getAIModels();

// 部署任务进度表：{ [modelId]: { taskId, progress } }
const deployTasks = {};

// 7 类识别标签
const LABELS = ['裂缝', '漂浮物', '渗漏', '边坡滑塌', '违章复垦', '建筑物漏损', '人员入侵'];

// multer 仅在内存中暂存文件，不落盘
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/ai/models —— 模型列表
router.get('/models', (req, res) => {
  success(res, modelsCache, '获取 AI 模型列表成功');
});

// POST /api/ai/recognize —— 图片识别（Mock）
// 字段名：image
router.post('/recognize', upload.single('image'), (req, res) => {
  if (!req.file) {
    return error(res, '未接收到图片文件（字段名应为 image）', 400);
  }

  // 假设图片 800x600
  const IMG_W = 800;
  const IMG_H = 600;

  // 随机 1-3 个标签
  const count = 1 + Math.floor(Math.random() * 3);
  const shuffled = [...LABELS].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, count);

  const boxes = picked.map((label) => {
    const w = 40 + Math.floor(Math.random() * 160); // 40-200
    const h = 40 + Math.floor(Math.random() * 160);
    const x = Math.floor(Math.random() * (IMG_W - w));
    const y = Math.floor(Math.random() * (IMG_H - h));
    const confidence = +(0.85 + Math.random() * 0.14).toFixed(2); // 0.85-0.99
    return { x, y, w, h, label, confidence };
  });

  // 类别统计
  const categories = {};
  for (const b of boxes) {
    categories[b.label] = (categories[b.label] || 0) + 1;
  }

  const accuracy = +(0.92 + Math.random() * 0.04).toFixed(2); // 0.92-0.96

  success(res, {
    boxes,
    summary: {
      totalCount: boxes.length,
      categories,
      accuracy
    }
  }, '识别完成');
});

// POST /api/ai/models/:id/deploy —— 模型下发（异步任务）
router.post('/models/:id/deploy', (req, res) => {
  const model = modelsCache.find((m) => m.id === req.params.id);
  if (!model) {
    return error(res, `未找到模型: ${req.params.id}`, 404);
  }
  const taskId = `TASK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  deployTasks[model.id] = { taskId, progress: 0 };
  // 模型状态标记为 deploying（Mock）
  model.edgeStatus = 'deploying';
  success(res, { taskId, status: 'deploying' }, '下发任务已创建');
});

// GET /api/ai/models/:id/deploy/status —— 下发进度（每次请求自增）
router.get('/models/:id/deploy/status', (req, res) => {
  const task = deployTasks[req.params.id];
  if (!task) {
    return error(res, `未找到该模型的下发任务: ${req.params.id}`, 404);
  }
  // 每次请求自增 10，封顶 100
  task.progress = Math.min(100, task.progress + 10);
  const status = task.progress >= 100 ? 'done' : 'deploying';
  // 完成时同步模型状态
  if (status === 'done') {
    const model = modelsCache.find((m) => m.id === req.params.id);
    if (model) model.edgeStatus = 'deployed';
  }
  success(res, { taskId: task.taskId, progress: task.progress, status }, '获取下发进度成功');
});

module.exports = router;
