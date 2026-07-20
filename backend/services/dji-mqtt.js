const mqtt = require('mqtt');
const { isDjiEnabled } = require('./dji-cloud');

const DJI_MQTT_HOST = process.env.DJI_MQTT_HOST || 'mqtt://localhost';
const DJI_MQTT_PORT = parseInt(process.env.DJI_MQTT_PORT || '1883');

let client = null;
const telemetryListeners = new Map();
const alarmListeners = new Map();
let connectAttempts = 0;
const maxConnectAttempts = 3;

function buildClientId() {
  return `dji-cloud-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function connect() {
  if (!isDjiEnabled()) {
    console.log('[DJI-MQTT] DJI Cloud not enabled, skipping MQTT connection');
    return false;
  }

  if (client && client.connected) {
    console.log('[DJI-MQTT] Already connected');
    return true;
  }

  try {
    client = mqtt.connect(DJI_MQTT_HOST, {
      port: DJI_MQTT_PORT,
      clientId: buildClientId(),
      username: process.env.DJI_APP_ID,
      password: process.env.DJI_APP_KEY,
      protocolVersion: 4,
      reconnectPeriod: 0
    });

    client.on('connect', () => {
      connectAttempts = 0;
      console.log('[DJI-MQTT] Connected to DJI MQTT broker');
      subscribeToTelemetry();
      subscribeToAlarms();
    });

    client.on('error', (err) => {
      connectAttempts++;
      console.warn('[DJI-MQTT] MQTT broker not available:', err.message || 'connection failed');
      if (connectAttempts >= maxConnectAttempts) {
        console.warn('[DJI-MQTT] Max connection attempts reached. Device data will be fetched via HTTP API.');
        if (client) {
          client.end();
          client = null;
        }
      }
    });

    client.on('close', () => {
      console.log('[DJI-MQTT] Connection closed');
    });

    client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        handleMessage(topic, payload);
      } catch (e) {
        console.error('[DJI-MQTT] Failed to parse message:', e.message);
      }
    });

    return true;
  } catch (error) {
    console.warn('[DJI-MQTT] Failed to create MQTT client:', error.message);
    return false;
  }
}

function subscribeToTelemetry() {
  if (!client || !client.connected) return;

  const topic = 'thing/product/+/osd';
  client.subscribe(topic, (err) => {
    if (err) {
      console.error('[DJI-MQTT] Failed to subscribe to telemetry:', err.message);
    } else {
      console.log('[DJI-MQTT] Subscribed to telemetry topic:', topic);
    }
  });
}

function subscribeToAlarms() {
  if (!client || !client.connected) return;

  const topic = 'thing/product/+/alarm';
  client.subscribe(topic, (err) => {
    if (err) {
      console.error('[DJI-MQTT] Failed to subscribe to alarms:', err.message);
    } else {
      console.log('[DJI-MQTT] Subscribed to alarm topic:', topic);
    }
  });
}

function handleMessage(topic, payload) {
  if (topic.includes('/osd')) {
    const deviceSn = extractDeviceSn(topic);
    if (deviceSn) {
      const telemetryData = {
        droneId: deviceSn,
        timestamp: payload.timestamp || new Date().toISOString(),
        lat: payload.latitude || 30.6,
        lng: payload.longitude || 114.3,
        battery: payload.battery_percentage || 100,
        signal: payload.signal_strength ? (payload.signal_strength > 70 ? '强' : payload.signal_strength > 40 ? '中' : '弱') : '强',
        altitude: payload.altitude || 100,
        velocity: payload.velocity || 5
      };
      notifyTelemetryListeners(deviceSn, telemetryData);
    }
  } else if (topic.includes('/alarm')) {
    const deviceSn = extractDeviceSn(topic);
    if (deviceSn) {
      notifyAlarmListeners(deviceSn, payload);
    }
  }
}

function extractDeviceSn(topic) {
  const parts = topic.split('/');
  if (parts.length >= 4) {
    return parts[3];
  }
  return null;
}

function notifyTelemetryListeners(deviceSn, data) {
  const listeners = telemetryListeners.get(deviceSn) || [];
  listeners.forEach(listener => listener(data));
}

function notifyAlarmListeners(deviceSn, data) {
  const listeners = alarmListeners.get(deviceSn) || [];
  listeners.forEach(listener => listener(data));
}

function subscribeToTelemetryForDevice(deviceSn, callback) {
  if (!isDjiEnabled()) {
    return () => {};
  }

  if (!telemetryListeners.has(deviceSn)) {
    telemetryListeners.set(deviceSn, []);
  }
  telemetryListeners.get(deviceSn).push(callback);

  return () => {
    const listeners = telemetryListeners.get(deviceSn) || [];
    const idx = listeners.indexOf(callback);
    if (idx >= 0) {
      listeners.splice(idx, 1);
    }
  };
}

function subscribeToAlarmsForDevice(deviceSn, callback) {
  if (!isDjiEnabled()) {
    return () => {};
  }

  if (!alarmListeners.has(deviceSn)) {
    alarmListeners.set(deviceSn, []);
  }
  alarmListeners.get(deviceSn).push(callback);

  return () => {
    const listeners = alarmListeners.get(deviceSn) || [];
    const idx = listeners.indexOf(callback);
    if (idx >= 0) {
      listeners.splice(idx, 1);
    }
  };
}

function disconnect() {
  if (client) {
    client.end();
    client = null;
  }
}

function isConnected() {
  return client && client.connected;
}

module.exports = {
  connect,
  disconnect,
  isConnected,
  subscribeToTelemetryForDevice,
  subscribeToAlarmsForDevice
};