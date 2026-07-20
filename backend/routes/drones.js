const express = require('express');
const { success, error } = require('../utils/response');
const { getDeviceList, getDeviceDetail, sendReturnHome, isDjiEnabled } = require('../services/dji-cloud');
const { subscribeToTelemetryForDevice } = require('../services/dji-mqtt');

const dronesRouter = express.Router();

dronesRouter.get('/', async (req, res) => {
  try {
    const devices = await getDeviceList();
    success(res, devices, '获取机队列表成功（DJI Cloud）');
  } catch (err) {
    console.error('[drones] Failed to get device list:', err.message);
    error(res, `DJI Cloud API 连接失败: ${err.message || '请确保大疆上云API后端服务已启动并运行在 ' + process.env.DJI_API_HOST}`, 503);
  }
});

dronesRouter.get('/:id', async (req, res) => {
  try {
    const device = await getDeviceDetail(req.params.id);
    if (!device) {
      return error(res, `未找到无人机: ${req.params.id}`, 404);
    }
    success(res, device, '获取无人机详情成功（DJI Cloud）');
  } catch (err) {
    console.error('[drones] Failed to get device detail:', err.message);
    error(res, `获取无人机详情失败: ${err.message}`, 500);
  }
});

dronesRouter.post('/:id/return-home', async (req, res) => {
  try {
    const result = await sendReturnHome(req.params.id);
    if (!result.success) {
      return error(res, result.message, 500);
    }
    success(res, {}, result.message);
  } catch (err) {
    console.error('[drones] Failed to send return home:', err.message);
    error(res, `下发返航指令失败: ${err.message}`, 500);
  }
});

dronesRouter.get('/:id/telemetry', async (req, res) => {
  try {
    const device = await getDeviceDetail(req.params.id);
    if (!device) {
      return error(res, `未找到无人机: ${req.params.id}`, 404);
    }
    success(res, {
      droneId: device.id,
      timestamp: new Date().toISOString(),
      lat: device.lat,
      lng: device.lng,
      battery: device.battery,
      signal: device.signal,
      altitude: device.altitude || 0,
      velocity: device.velocity || 0
    }, '获取遥测数据成功（DJI Cloud）');
  } catch (err) {
    console.error('[drones] Failed to get telemetry:', err.message);
    error(res, `获取遥测数据失败: ${err.message}`, 500);
  }
});

const geoFencesRouter = express.Router();

let geoFencesCache = [];

geoFencesRouter.get('/', (req, res) => {
  success(res, geoFencesCache, '获取电子围栏列表成功');
});

geoFencesRouter.post('/', (req, res) => {
  const { name, polygon, type } = req.body || {};
  if (!name || !Array.isArray(polygon) || polygon.length < 3) {
    return error(res, '参数不合法：name 必填，polygon 至少 3 个点', 400);
  }
  const newFence = {
    id: `GEOFENCE-${String(geoFencesCache.length + 1).padStart(3, '0')}`,
    name,
    polygon,
    type: type || 'restricted'
  };
  geoFencesCache.push(newFence);
  success(res, newFence, '电子围栏创建成功');
});

geoFencesRouter.delete('/:id', (req, res) => {
  const idx = geoFencesCache.findIndex((f) => f.id === req.params.id);
  if (idx < 0) {
    return error(res, `未找到电子围栏: ${req.params.id}`, 404);
  }
  const [removed] = geoFencesCache.splice(idx, 1);
  success(res, removed, '电子围栏已删除');
});

module.exports = { dronesRouter, geoFencesRouter };