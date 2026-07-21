const express = require('express');
const multer = require('multer');
const http = require('http');
const { success, error } = require('../utils/response');

const router = express.Router();

const modelsCache = [
  { id: 'mdl-yolo-seg-001', name: 'YOLOv8-裂缝剥落分割', version: 'v1.0.0', type: '语义分割', accuracy: 94.5, edgeStatus: 'deployed' }
];
const deployTasks = {};

const YOLO_SERVER_URL = 'http://localhost:8080';

const upload = multer({ storage: multer.memoryStorage() });

router.get('/models', (req, res) => {
  success(res, modelsCache, '获取 AI 模型列表成功');
});

router.post('/recognize', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return error(res, '未接收到图片文件（字段名应为 file）', 400);
  }

  const imageBuffer = req.file.buffer;
  const base64Image = imageBuffer.toString('base64');

  try {
    const result = await callYOLOServer(base64Image);
    if (result.code === 0) {
      success(res, result.data, result.msg || '识别完成');
    } else {
      console.error('[YOLO] 推理失败:', result.msg);
      return error(res, 'YOLOv8 模型推理失败: ' + result.msg, 500);
    }
  } catch (err) {
    console.error('[YOLO] 调用失败:', err);
    return error(res, 'YOLOv8 模型调用失败: ' + err.message, 500);
  }
});

function callYOLOServer(base64Image) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': Buffer.byteLength(base64Image)
      },
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error('解析YOLO服务器响应失败'));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('YOLO服务器超时'));
    });

    req.write(base64Image);
    req.end();
  });
}

router.post('/models/:id/deploy', (req, res) => {
  const model = modelsCache.find((m) => m.id === req.params.id);
  if (!model) {
    return error(res, `未找到模型: ${req.params.id}`, 404);
  }
  const taskId = `TASK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  deployTasks[model.id] = { taskId, progress: 0 };
  model.edgeStatus = 'deploying';
  success(res, { taskId, status: 'deploying' }, '下发任务已创建');
});

router.get('/models/:id/deploy/status', (req, res) => {
  const task = deployTasks[req.params.id];
  if (!task) {
    return error(res, `未找到该模型的下发任务: ${req.params.id}`, 404);
  }
  task.progress = Math.min(100, task.progress + 10);
  const status = task.progress >= 100 ? 'done' : 'deploying';
  if (status === 'done') {
    const model = modelsCache.find((m) => m.id === req.params.id);
    if (model) model.edgeStatus = 'deployed';
  }
  success(res, { taskId: task.taskId, progress: task.progress, status }, '获取下发进度成功');
});

module.exports = router;