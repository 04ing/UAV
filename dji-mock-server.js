const express = require('express');
const cors = require('cors');
const app = express();
const port = 6789;

app.use(cors());
app.use(express.json());

const MOCK_DEVICES = [
  {
    sn: 'DJI2024001',
    name: '无人机001',
    model: 'M30T',
    status: 'ONLINE',
    battery: 85,
    latitude: 31.2304,
    longitude: 121.4737,
    altitude: 100,
    speed: 5.5,
    heading: 45
  },
  {
    sn: 'DJI2024002',
    name: '无人机002',
    model: 'M210RTK',
    status: 'ONLINE',
    battery: 72,
    latitude: 31.2306,
    longitude: 121.4739,
    altitude: 80,
    speed: 3.2,
    heading: 120
  },
  {
    sn: 'DJI2024003',
    name: '无人机003',
    model: 'M350RTK',
    status: 'STANDBY',
    battery: 45,
    latitude: 31.2300,
    longitude: 121.4730,
    altitude: 0,
    speed: 0,
    heading: 0
  }
];

const MOCK_FLIGHT_LOGS = [
  {
    flight_id: 'FL001',
    start_time: '2024-01-15 08:00:00',
    end_time: '2024-01-15 08:30:00',
    duration: 1800,
    distance: 5.2,
    max_altitude: 150,
    status: 'COMPLETED'
  },
  {
    flight_id: 'FL002',
    start_time: '2024-01-14 14:00:00',
    end_time: '2024-01-14 14:45:00',
    duration: 2700,
    distance: 8.5,
    max_altitude: 200,
    status: 'COMPLETED'
  }
];

app.get('/manage/api/v1/workspaces/:workspaceId/devices/topologies', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      list: MOCK_DEVICES.map(device => ({
        device: {
          sn: device.sn,
          name: device.name,
          model: device.model,
          status: device.status,
          position: {
            lat: device.latitude,
            lng: device.longitude,
            altitude: device.altitude
          },
          telemetry: {
            battery: device.battery,
            speed: device.speed,
            heading: device.heading
          }
        }
      }))
    }
  });
});

app.get('/manage/api/v1/workspaces/:workspaceId/devices/:deviceSn', (req, res) => {
  const device = MOCK_DEVICES.find(d => d.sn === req.params.deviceSn);
  if (device) {
    res.json({
      code: 0,
      message: 'success',
      data: {
        sn: device.sn,
        name: device.name,
        model: device.model,
        status: device.status,
        battery: device.battery,
        position: {
          lat: device.latitude,
          lng: device.longitude,
          altitude: device.altitude
        },
        telemetry: {
          speed: device.speed,
          heading: device.heading
        }
      }
    });
  } else {
    res.json({
      code: 1,
      message: 'Device not found',
      data: null
    });
  }
});

app.post('/manage/api/v1/workspaces/:workspaceId/devices/:deviceSn/commands/return-home', (req, res) => {
  const device = MOCK_DEVICES.find(d => d.sn === req.params.deviceSn);
  if (device) {
    res.json({
      code: 0,
      message: 'success',
      data: {
        command_id: `CMD-${Date.now()}`,
        status: 'EXECUTING',
        message: '返航指令已发送'
      }
    });
  } else {
    res.json({
      code: 1,
      message: 'Device not found',
      data: null
    });
  }
});

app.get('/manage/api/v1/workspaces/:workspaceId/devices/:deviceSn/flight-logs', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      list: MOCK_FLIGHT_LOGS
    }
  });
});

app.get('/manage/api/v1/workspaces/:workspaceId/devices/:deviceSn/live-stream', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      stream_url: 'rtmp://localhost/live/dji-stream',
      hls_url: 'http://localhost:8080/live/dji-stream.m3u8'
    }
  });
});

app.listen(port, () => {
  console.log(`DJI Cloud API Mock Server running on http://localhost:${port}`);
});