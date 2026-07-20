const http = require('http');
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const DJI_APP_ID = process.env.DJI_APP_ID || '';
const DJI_APP_KEY = process.env.DJI_APP_KEY || '';
const DJI_APP_LICENSE = process.env.DJI_APP_LICENSE || '';
const DJI_API_HOST = process.env.DJI_API_HOST || 'http://localhost:6789';
const DJI_CLOUD_ENABLED = process.env.DJI_CLOUD_ENABLED === 'true';
const DJI_WORKSPACE_ID = process.env.DJI_WORKSPACE_ID || 'workspace001';

function isDjiEnabled() {
  return DJI_CLOUD_ENABLED && DJI_APP_ID && DJI_APP_KEY && DJI_APP_LICENSE;
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function generateTimestamp() {
  return Date.now().toString();
}

function generateSignature(method, timestamp, nonce, path, params = {}) {
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  const signString = `${DJI_APP_KEY}${method}${path}${timestamp}${nonce}${sortedParams}`;
  return crypto.createHmac('sha256', DJI_APP_KEY).update(signString).digest('hex');
}

function makeRequest(options, data = null) {
  const protocol = DJI_API_HOST.startsWith('https') ? https : http;
  
  return new Promise((resolve, reject) => {
    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`DJI API Error ${res.statusCode}: ${json.message || JSON.stringify(json)}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`DJI API Parse Error: ${e.message}, body: ${body.substring(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function getDeviceList() {
  const timestamp = generateTimestamp();
  const nonce = generateNonce();
  const path = `/manage/api/v1/workspaces/${DJI_WORKSPACE_ID}/devices/topologies`;
  const signature = generateSignature('GET', timestamp, nonce, path);

  const options = {
    hostname: new URL(DJI_API_HOST).hostname,
    port: new URL(DJI_API_HOST).port || (DJI_API_HOST.startsWith('https') ? 443 : 80),
    path: path,
    method: 'GET',
    headers: {
      'X-DJI-AppID': DJI_APP_ID,
      'X-DJI-Timestamp': timestamp,
      'X-DJI-Nonce': nonce,
      'X-DJI-Signature': signature
    }
  };

  const result = await makeRequest(options);
  console.log('[DJI] Device list response:', JSON.stringify(result).substring(0, 1500));
  
  if (result && result.code === 0 && result.data && result.data.list) {
    const devices = [];
    result.data.list.forEach(item => {
      if (item.hosts) {
        item.hosts.forEach(host => {
          devices.push({
            id: host.sn || host.device_sn || host.id || `DRONE-${Date.now()}`,
            model: host.device_model ? host.device_model.key || 'DJI Unknown' : 'DJI Unknown',
            battery: host.battery_percentage || host.battery || 100,
            signal: host.signal_strength ? (host.signal_strength > 70 ? '强' : host.signal_strength > 40 ? '中' : '弱') : '强',
            status: host.online_status ? 'inspecting' : 'offline',
            lat: host.latitude || host.gps_latitude || 30.6,
            lng: host.longitude || host.gps_longitude || 114.3,
            lastUpdate: host.update_time || host.timestamp || new Date().toISOString()
          });
        });
      }
      if (item.parents) {
        item.parents.forEach(parent => {
          devices.push({
            id: parent.sn || parent.device_sn || parent.id || `RC-${Date.now()}`,
            model: parent.device_model ? parent.device_model.key || 'DJI RC' : 'DJI RC',
            battery: parent.battery_percentage || parent.battery || 100,
            signal: '强',
            status: parent.online_status ? 'idle' : 'offline',
            lat: parent.latitude || parent.gps_latitude || 30.6,
            lng: parent.longitude || parent.gps_longitude || 114.3,
            lastUpdate: parent.update_time || parent.timestamp || new Date().toISOString()
          });
        });
      }
      if (item.device) {
        const dev = item.device;
        devices.push({
          id: dev.sn || dev.device_sn || dev.id || `DRONE-${Date.now()}`,
          model: dev.model || (dev.device_model ? (dev.device_model.key || 'DJI Unknown') : 'DJI Unknown'),
          battery: dev.battery || dev.battery_percentage || dev.telemetry?.battery || 100,
          signal: dev.signal_strength ? (dev.signal_strength > 70 ? '强' : dev.signal_strength > 40 ? '中' : '弱') : '强',
          status: dev.status === 'ONLINE' ? 'inspecting' : dev.status === 'STANDBY' ? 'idle' : 'offline',
          lat: dev.latitude || dev.position?.lat || 30.6,
          lng: dev.longitude || dev.position?.lng || 114.3,
          altitude: dev.altitude || dev.position?.altitude || 0,
          speed: dev.speed || dev.telemetry?.speed || 0,
          heading: dev.heading || dev.telemetry?.heading || 0,
          name: dev.name || '',
          lastUpdate: dev.update_time || dev.timestamp || new Date().toISOString()
        });
      }
    });
    return devices;
  }
  
  if (result && result.code === 0) {
    return [];
  }
  
  throw new Error(`DJI API returned unexpected response: ${JSON.stringify(result).substring(0, 500)}`);
}

async function getDeviceDetail(deviceSn) {
  const devices = await getDeviceList();
  return devices.find(d => d.id === deviceSn) || null;
}

async function sendReturnHome(deviceSn) {
  const timestamp = generateTimestamp();
  const nonce = generateNonce();
  const path = `/manage/api/v1/workspaces/${DJI_WORKSPACE_ID}/devices/${deviceSn}/commands/return-home`;
  const signature = generateSignature('POST', timestamp, nonce, path);

  const options = {
    hostname: new URL(DJI_API_HOST).hostname,
    port: new URL(DJI_API_HOST).port || (DJI_API_HOST.startsWith('https') ? 443 : 80),
    path: path,
    method: 'POST',
    headers: {
      'X-DJI-AppID': DJI_APP_ID,
      'X-DJI-Timestamp': timestamp,
      'X-DJI-Nonce': nonce,
      'X-DJI-Signature': signature,
      'Content-Type': 'application/json'
    }
  };

  try {
    const result = await makeRequest(options, {});
    console.log('[DJI] Return home response:', JSON.stringify(result));
    return {
      success: result && result.code === 0,
      message: result && result.message || '返航指令已下发'
    };
  } catch (error) {
    throw new Error(`下发返航指令失败: ${error.message}`);
  }
}

async function getFlightLogs(deviceSn, startTime, endTime) {
  const timestamp = generateTimestamp();
  const nonce = generateNonce();
  const path = `/manage/api/v1/workspaces/${DJI_WORKSPACE_ID}/devices/${deviceSn}/flight-logs`;
  const params = { start_time: startTime, end_time: endTime };
  const signature = generateSignature('GET', timestamp, nonce, path, params);

  const query = querystring.stringify(params);

  const options = {
    hostname: new URL(DJI_API_HOST).hostname,
    port: new URL(DJI_API_HOST).port || (DJI_API_HOST.startsWith('https') ? 443 : 80),
    path: `${path}?${query}`,
    method: 'GET',
    headers: {
      'X-DJI-AppID': DJI_APP_ID,
      'X-DJI-Timestamp': timestamp,
      'X-DJI-Nonce': nonce,
      'X-DJI-Signature': signature
    }
  };

  const result = await makeRequest(options);
  return result && result.data || [];
}

async function getLiveStreamUrl(deviceSn) {
  const timestamp = generateTimestamp();
  const nonce = generateNonce();
  const path = `/manage/api/v1/workspaces/${DJI_WORKSPACE_ID}/devices/${deviceSn}/live-stream`;
  const signature = generateSignature('GET', timestamp, nonce, path);

  const options = {
    hostname: new URL(DJI_API_HOST).hostname,
    port: new URL(DJI_API_HOST).port || (DJI_API_HOST.startsWith('https') ? 443 : 80),
    path: path,
    method: 'GET',
    headers: {
      'X-DJI-AppID': DJI_APP_ID,
      'X-DJI-Timestamp': timestamp,
      'X-DJI-Nonce': nonce,
      'X-DJI-Signature': signature
    }
  };

  const result = await makeRequest(options);
  if (result && result.data && result.data.url) {
    return { url: result.data.url, message: '获取直播流成功' };
  }
  return { url: null, message: '设备未开启直播' };
}

module.exports = {
  isDjiEnabled,
  getDeviceList,
  getDeviceDetail,
  sendReturnHome,
  getFlightLogs,
  getLiveStreamUrl
};