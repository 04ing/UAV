const express = require('express');
const { success, error } = require('../utils/response');
const DataStore = require('../data/dataStore');

const dronesRouter = express.Router();

dronesRouter.get('/', (req, res) => {
  const drones = DataStore.drones.getAll();
  success(res, drones, '获取机队列表成功');
});

dronesRouter.get('/:id', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }
  success(res, device, '获取无人机详情成功');
});

dronesRouter.post('/upload', (req, res) => {
  const { drones } = req.body || {};
  if (!Array.isArray(drones) || drones.length === 0) {
    return error(res, '参数不合法：drones 必须是数组且至少包含一个无人机数据', 400);
  }

  const uploaded = [];
  const updated = [];

  for (const droneData of drones) {
    const { id, model, battery, signal, status, lat, lng, altitude, speed, heading, lastUpdate } = droneData;
    
    if (!id || !model) {
      continue;
    }

    const existing = DataStore.drones.getById(id);
    const drone = {
      id,
      model,
      battery: battery || 0,
      signal: signal || '弱',
      status: status || 'idle',
      lat: lat || 0,
      lng: lng || 0,
      altitude: altitude || 0,
      speed: speed || 0,
      heading: heading || 0,
      lastUpdate: lastUpdate || new Date().toISOString()
    };

    if (existing) {
      DataStore.drones.update(id, drone);
      updated.push(id);
    } else {
      DataStore.drones.add(drone);
      uploaded.push(id);
    }
  }

  success(res, { uploaded, updated, total: uploaded.length + updated.length }, 
    `成功上传 ${uploaded.length} 台新无人机，更新 ${updated.length} 台无人机数据`);
});

dronesRouter.post('/:id/telemetry', (req, res) => {
  const { lat, lng, battery, signal, altitude, speed, heading, status } = req.body || {};
  
  if (lat === undefined || lng === undefined) {
    return error(res, '参数不合法：lat 和 lng 必填', 400);
  }

  const updates = {
    lat,
    lng,
    lastUpdate: new Date().toISOString()
  };

  if (battery !== undefined) updates.battery = battery;
  if (signal !== undefined) updates.signal = signal;
  if (altitude !== undefined) updates.altitude = altitude;
  if (speed !== undefined) updates.speed = speed;
  if (heading !== undefined) updates.heading = heading;
  if (status !== undefined) updates.status = status;

  const updated = DataStore.drones.update(req.params.id, updates);
  if (!updated) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  success(res, updated, '遥测数据更新成功');
});

dronesRouter.post('/:id/return-home', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
  if (!device) {
    return error(res, `未找到无人机: ${req.params.id}`, 404);
  }

  DataStore.drones.update(req.params.id, { 
    status: 'returning',
    lastUpdate: new Date().toISOString()
  });

  success(res, {}, `返航指令已发送至 ${device.id}`);
});

dronesRouter.get('/:id/telemetry', (req, res) => {
  const device = DataStore.drones.getById(req.params.id);
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
    velocity: device.speed || 0,
    heading: device.heading || 0,
    status: device.status
  }, '获取遥测数据成功');
});

const geoFencesRouter = express.Router();

geoFencesRouter.get('/', (req, res) => {
  const fences = DataStore.geoFences.getAll();
  success(res, fences, '获取电子围栏列表成功');
});

geoFencesRouter.post('/', (req, res) => {
  const { name, polygon, type } = req.body || {};
  if (!name || !Array.isArray(polygon) || polygon.length < 3) {
    return error(res, '参数不合法：name 必填，polygon 至少 3 个点', 400);
  }
  
  const fences = DataStore.geoFences.getAll();
  const newFence = {
    id: `GEOFENCE-${String(fences.length + 1).padStart(3, '0')}`,
    name,
    polygon,
    type: type || 'restricted'
  };

  DataStore.geoFences.add(newFence);
  success(res, newFence, '电子围栏创建成功');
});

geoFencesRouter.delete('/:id', (req, res) => {
  const removed = DataStore.geoFences.delete(req.params.id);
  if (!removed) {
    return error(res, `未找到电子围栏: ${req.params.id}`, 404);
  }
  success(res, removed, '电子围栏已删除');
});

module.exports = { dronesRouter, geoFencesRouter };