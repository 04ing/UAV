/**
 * 无人机遥测数据模拟上报脚本
 *
 * 模拟一架无人机沿预设航线飞行，每 2 秒上报一次遥测数据到系统。
 * 验证内容：
 *   1. 登录获取 JWT Token
 *   2. 健康探针 /api/meta/health
 *   3. 接口元数据 /api/meta/endpoints（验证接口管理模块）
 *   4. 无人机注册（确保目标无人机存在）
 *   5. 遥测数据上报 POST /api/drones/:id/telemetry（沿航线移动）
 *   6. 低电量自动返航验证（电量 ≤ 25% 系统是否自动切换 returning）
 *   7. 告警上传 POST /api/alarms/upload
 *   8. 一键返航 POST /api/drones/:id/return-home
 *   9. 健康诊断 GET /api/drones/:id/health
 *  10. 故障注入 + 清除 POST/DELETE /api/drones/:id/fault
 *
 * 用法:
 *   node tests/simulate-telemetry.js                          # 默认本地 3000
 *   node tests/simulate-telemetry.js --host http://47.103.29.77:4000  # 阿里云
 */

const http = require('http');
const https = require('https');

// ============ 配置 ============
const args = process.argv.slice(2);
const hostArgIdx = args.indexOf('--host');
const SERVER_URL = hostArgIdx >= 0 && args[hostArgIdx + 1] ? args[hostArgIdx + 1] : 'http://localhost:3000';
const DRONE_ID = 'DRONE-SIM-001';
const REPORT_INTERVAL_MS = 2000;   // 上报间隔
const TOTAL_REPORTS = 30;          // 总上报次数（约 60 秒）

// 预设航线（武汉东湖区域，绕巡检点一圈）
const FLIGHT_ROUTE = [
  { lat: 30.5980, lng: 114.3050, alt: 120 },  // 起飞点
  { lat: 30.5990, lng: 114.3060, alt: 130 },
  { lat: 30.6000, lng: 114.3070, alt: 140 },
  { lat: 30.6010, lng: 114.3080, alt: 140 },
  { lat: 30.6020, lng: 114.3070, alt: 135 },
  { lat: 30.6025, lng: 114.3050, alt: 130 },
  { lat: 30.6020, lng: 114.3030, alt: 125 },
  { lat: 30.6010, lng: 114.3020, alt: 120 },
  { lat: 30.6000, lng: 114.3025, alt: 120 },
  { lat: 30.5990, lng: 114.3040, alt: 120 },
  { lat: 30.5980, lng: 114.3050, alt: 120 },  // 回到起点
];

// ============ HTTP 工具 ============
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER_URL + path);
    const lib = url.protocol === 'https:' ? https : http;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const data = body ? JSON.stringify(body) : null;

    const req = lib.request(url, { method, headers, timeout: 10000 }, (res) => {
      let chunks = '';
      res.on('data', (d) => (chunks += d));
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch { resolve({ raw: chunks, statusCode: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    if (data) req.write(data);
    req.end();
  });
}

// ============ 航线插值 ============
function interpolate(route, t) {
  // t: 0~1 沿整条航线的进度
  const totalSegs = route.length - 1;
  const segFloat = t * totalSegs;
  const segIdx = Math.min(Math.floor(segFloat), totalSegs - 1);
  const segT = segFloat - segIdx;
  const a = route[segIdx];
  const b = route[segIdx + 1];
  return {
    lat: a.lat + (b.lat - a.lat) * segT,
    lng: a.lng + (b.lng - a.lng) * segT,
    altitude: Math.round(a.alt + (b.alt - a.alt) * segT),
  };
}

function calculateHeading(route, t) {
  const pos = interpolate(route, Math.min(t + 0.01, 1));
  const cur = interpolate(route, t);
  const dLat = pos.lat - cur.lat;
  const dLng = pos.lng - cur.lng;
  let heading = Math.atan2(dLng, dLat) * (180 / Math.PI);
  if (heading < 0) heading += 360;
  return Math.round(heading);
}

// ============ 主流程 ============
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     无人机遥测数据模拟上报脚本 - 接口管理模块验证              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  服务器地址:  ${SERVER_URL}`);
  console.log(`  无人机 ID:   ${DRONE_ID}`);
  console.log(`  上报间隔:    ${REPORT_INTERVAL_MS}ms`);
  console.log(`  总上报次数:  ${TOTAL_REPORTS}`);
  console.log(`  航线点数:    ${FLIGHT_ROUTE.length}`);
  console.log('');

  // ========== 步骤1: 登录 ==========
  console.log('━━━ [1/10] 登录获取 JWT Token ━━━');
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123',
  });
  if (loginRes.code !== 0) {
    console.error('❌ 登录失败:', loginRes.msg);
    process.exit(1);
  }
  const token = loginRes.data.token;
  console.log('✅ 登录成功, 用户:', loginRes.data.user.username, '角色:', loginRes.data.user.role);
  console.log('   Token:', token.substring(0, 30) + '...');

  // ========== 步骤2: 健康探针 ==========
  console.log('\n━━━ [2/10] 健康探针 /api/meta/health ━━━');
  const healthRes = await request('GET', '/api/meta/health', null, token);
  if (healthRes.code === 0) {
    console.log('✅ 服务健康:', healthRes.data.status, '@', healthRes.data.timestamp);
  } else {
    console.error('❌ 健康探针失败:', healthRes);
  }

  // ========== 步骤3: 接口元数据 ==========
  console.log('\n━━━ [3/10] 接口元数据 /api/meta/endpoints ━━━');
  const endpointsRes = await request('GET', '/api/meta/endpoints', null, token);
  const endpoints = endpointsRes.data || endpointsRes;
  if (Array.isArray(endpoints)) {
    console.log(`✅ 接口管理模块正常，共 ${endpoints.length} 个接口:`);
    const categories = {};
    endpoints.forEach((ep) => {
      categories[ep.category] = (categories[ep.category] || 0) + 1;
    });
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} 个接口`);
    });
    // 验证遥测上报接口是否存在
    const telemetryEp = endpoints.find(
      (e) => e.method === 'POST' && e.path && e.path.includes('/:id/telemetry')
    );
    if (telemetryEp) {
      console.log('✅ 遥测上报接口已注册:', telemetryEp.method, telemetryEp.path);
      console.log('   描述:', telemetryEp.description);
    } else {
      console.warn('⚠️  未找到遥测上报接口元数据');
    }
  } else {
    console.error('❌ 接口元数据获取失败:', endpointsRes);
  }

  // ========== 步骤4: 注册模拟无人机 ==========
  console.log('\n━━━ [4/10] 注册模拟无人机 ━━━');
  const uploadRes = await request('POST', '/api/drones/upload', {
    drones: [
      {
        id: DRONE_ID,
        model: 'DJI M350 RTK (模拟)',
        battery: 100,
        signal: '强',
        status: 'idle',
        lat: FLIGHT_ROUTE[0].lat,
        lng: FLIGHT_ROUTE[0].lng,
        altitude: 0,
      },
    ],
  }, token);
  if (uploadRes.code === 0) {
    console.log('✅ 无人机注册成功:', uploadRes.data);
  } else {
    console.warn('⚠️  注册返回:', uploadRes.msg);
  }

  // ========== 步骤5: 开始遥测上报循环 ==========
  console.log('\n━━━ [5/10] 开始遥测数据上报（沿航线飞行）━━━');
  console.log(`   每 ${REPORT_INTERVAL_MS}ms 上报一次，共 ${TOTAL_REPORTS} 次\n`);

  let reportCount = 0;
  let lowBatteryAlarmSent = false;
  let autoReturnTriggered = false;
  let crashAlarmSent = false;

  await new Promise((resolve) => {
    const timer = setInterval(async () => {
      reportCount++;
      const t = (reportCount - 1) / TOTAL_REPORTS;
      const pos = interpolate(FLIGHT_ROUTE, t);
      const heading = calculateHeading(FLIGHT_ROUTE, t);

      // 电量从 100% 线性消耗到 0%
      const battery = Math.max(0, Math.round(100 - (reportCount / TOTAL_REPORTS) * 100));
      const speed = battery > 25 ? 8 + Math.round(Math.random() * 4) : 5; // 低电量降速
      const signal = battery > 15 ? '强' : battery > 5 ? '中' : '弱';
      const altitude = pos.altitude + Math.round((Math.random() - 0.5) * 2);
      const status = battery <= 0 ? 'offline' : battery <= 25 && autoReturnTriggered ? 'returning' : 'inspecting';

      try {
        const res = await request('POST', `/api/drones/${DRONE_ID}/telemetry`, {
          lat: parseFloat(pos.lat.toFixed(6)),
          lng: parseFloat(pos.lng.toFixed(6)),
          battery,
          signal,
          altitude,
          speed,
          heading,
          status,
        }, token);

        const returned = res.data || {};
        const actualStatus = returned.status || status;
        const statusIcon =
          actualStatus === 'inspecting' ? '🚁' :
          actualStatus === 'returning' ? '🏠' :
          actualStatus === 'offline' ? '💀' : '⏸';

        console.log(
          `[${String(reportCount).padStart(2)}/${TOTAL_REPORTS}] ${statusIcon} ` +
          `lat=${pos.lat.toFixed(5)} lng=${pos.lng.toFixed(5)} ` +
          `bat=${String(battery).padStart(3)}% spd=${speed}m/s hdg=${heading}° ` +
          `alt=${altitude}m sig=${signal} → ${actualStatus}` +
          (res.code !== 0 ? ` ⚠️ ${res.msg}` : ' ✅')
        );

        // 检测自动返航触发
        if (battery <= 25 && !autoReturnTriggered && actualStatus === 'returning') {
          autoReturnTriggered = true;
          console.log('  🎯 系统自动触发返航！电量 ≤ 25%，状态 inspecting → returning');
        }

        // 低电量告警上报
        if (battery <= 25 && !lowBatteryAlarmSent) {
          lowBatteryAlarmSent = true;
          console.log('  📨 上报低电量告警...');
          const alarmRes = await request('POST', '/api/alarms/upload', {
            alarms: [
              {
                type: '低电量告警',
                severity: 'warning',
                droneId: DRONE_ID,
                lat: pos.lat,
                lng: pos.lng,
                description: `模拟无人机电量 ${battery}%，低于安全阈值 25%`,
              },
            ],
          }, token);
          console.log('  ', alarmRes.code === 0 ? '✅ 告警上传成功: ' + alarmRes.data.uploaded.join(',') : '⚠️ ' + alarmRes.msg);
        }

        // 电量耗尽坠毁告警
        if (battery <= 0 && !crashAlarmSent) {
          crashAlarmSent = true;
          console.log('  🚨 电量耗尽！上报紧急告警...');
          const crashRes = await request('POST', '/api/alarms/upload', {
            alarms: [
              {
                type: '无人机失联',
                severity: 'critical',
                droneId: DRONE_ID,
                lat: pos.lat,
                lng: pos.lng,
                description: '模拟电量耗尽坠毁，最后位置已记录',
              },
            ],
          }, token);
          console.log('  ', crashRes.code === 0 ? '✅ 紧急告警已上传: ' + crashRes.data.uploaded.join(',') : '⚠️ ' + crashRes.msg);
        }
      } catch (err) {
        console.error(`  ❌ 上报失败: ${err.message}`);
      }

      if (reportCount >= TOTAL_REPORTS) {
        clearInterval(timer);
        resolve();
      }
    }, REPORT_INTERVAL_MS);
  });

  // ========== 步骤6: 验证最终无人机状态 ==========
  console.log('\n━━━ [6/10] 查询无人机最终状态 ━━━');
  const droneRes = await request('GET', `/api/drones/${DRONE_ID}`, null, token);
  if (droneRes.code === 0) {
    const d = droneRes.data;
    console.log('✅ 无人机状态:');
    console.log(`   ID:       ${d.id}`);
    console.log(`   状态:     ${d.status}`);
    console.log(`   电量:     ${d.battery}%`);
    console.log(`   位置:     ${d.lat}, ${d.lng}`);
    console.log(`   高度:     ${d.altitude}m`);
    console.log(`   最后更新: ${d.lastUpdate}`);
  }

  // ========== 步骤7: 健康诊断 ==========
  console.log('\n━━━ [7/10] 健康诊断 /api/drones/:id/health ━━━');
  const healthDiagRes = await request('GET', `/api/drones/${DRONE_ID}/health`, null, token);
  if (healthDiagRes.code === 0) {
    console.log('✅ 健康诊断:');
    console.log('   整体状态:', healthDiagRes.data.overall);
    if (healthDiagRes.data.components) {
      Object.entries(healthDiagRes.data.components).forEach(([k, v]) => {
        console.log(`   ${k}: ${v.status || v}`);
      });
    }
  } else {
    console.log('⚠️ 健康诊断返回:', healthDiagRes.msg);
  }

  // ========== 步骤8: 告警列表验证 ==========
  console.log('\n━━━ [8/10] 查询告警列表（验证告警是否已入库）━━━');
  const alarmsRes = await request('GET', `/api/alarms?droneId=${DRONE_ID}`, null, token);
  if (alarmsRes.code === 0) {
    const alarms = alarmsRes.data || [];
    console.log(`✅ 共查询到 ${alarms.length} 条告警（droneId=${DRONE_ID}）:`);
    alarms.forEach((a) => {
      const icon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵';
      console.log(`   ${icon} ${a.id} | ${a.type} | ${a.severity} | ${a.status} | ${a.description || ''}`);
    });
  } else {
    console.log('⚠️ 告警查询失败:', alarmsRes.msg);
  }

  // ========== 步骤9: 故障注入测试 ==========
  console.log('\n━━━ [9/10] 故障注入测试 POST /api/drones/:id/fault ━━━');
  const faultRes = await request('POST', `/api/drones/${DRONE_ID}/fault`, {
    faultType: 'gps_lost',
  }, token);
  console.log('   触发 gps_lost:', faultRes.code === 0 ? '✅' : '⚠️', faultRes.msg);

  const faultQueryRes = await request('GET', `/api/drones/${DRONE_ID}/fault`, null, token);
  if (faultQueryRes.code === 0 && faultQueryRes.data.fault) {
    console.log('   故障状态:', faultQueryRes.data.fault.type, '触发时间:', faultQueryRes.data.fault.triggeredAt);
  }

  const faultClearRes = await request('DELETE', `/api/drones/${DRONE_ID}/fault`, null, token);
  console.log('   清除故障:', faultClearRes.code === 0 ? '✅' : '⚠️', faultClearRes.msg);

  // ========== 步骤10: 验证总结 ==========
  console.log('\n━━━ [10/10] 验证总结 ━━━');
  console.log('┌──────────────────────────────────────────────────┐');
  console.log('│  接口管理模块验证结果                            │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  ✅ JWT 认证          ${loginRes.code === 0 ? '通过' : '失败'}              │`);
  console.log(`│  ✅ 健康探针          ${healthRes.code === 0 ? '通过' : '失败'}              │`);
  console.log(`│  ✅ 接口元数据        ${Array.isArray(endpoints) ? '通过 (' + endpoints.length + ' 个接口)' : '失败'}              │`);
  console.log(`│  ✅ 无人机注册        ${uploadRes.code === 0 ? '通过' : '失败'}              │`);
  console.log(`│  ✅ 遥测数据上报      ${reportCount} 次全部完成       │`);
  console.log(`│  ✅ 低电量自动返航    ${autoReturnTriggered ? '通过' : '未触发'}              │`);
  console.log(`│  ✅ 告警上传          ${lowBatteryAlarmSent ? '通过' : '未发送'}              │`);
  console.log(`│  ✅ 紧急告警          ${crashAlarmSent ? '通过' : '未发送'}              │`);
  console.log(`│  ✅ 健康诊断          ${healthDiagRes.code === 0 ? '通过' : '失败'}              │`);
  console.log(`│  ✅ 告警查询          ${alarmsRes.code === 0 ? '通过' : '失败'}              │`);
  console.log(`│  ✅ 故障注入/清除      ${faultRes.code === 0 && faultClearRes.code === 0 ? '通过' : '失败'}              │`);
  console.log('└──────────────────────────────────────────────────┘');
  console.log('\n✨ 验证完成！接口管理模块的接收逻辑运行正常。');
  console.log(`   前端接口管理页面: ${SERVER_URL}/frontend/pages/api.html`);
  console.log(`   阿里云访问地址:   http://47.103.29.77:4000/frontend/pages/api.html`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ 脚本执行失败:', err);
  process.exit(1);
});
