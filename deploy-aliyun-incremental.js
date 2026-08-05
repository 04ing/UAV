/**
 * 阿里云增量部署脚本（拉取最新代码 + 重启 PM2）
 */

const { Client } = require('ssh2');

const config = {
  host: '47.103.29.77',
  port: 22,
  username: 'root',
  password: 'SKFing_11040922',
  readyTimeout: 20000,
};

const DEPLOY_DIR = '/opt/UAV';

// 增量更新命令：fetch + reset（服务器上已有仓库）
const deployCmd =
  "set -e\n" +
  "cd " + DEPLOY_DIR + "\n" +
  "echo '当前版本:' && git log -1 --pretty=format:'%h %s' && echo ''\n" +
  "echo '拉取最新代码（主站+镜像降级）...'\n" +
  "git fetch origin main 2>&1 || (git remote set-url origin https://mirror.ghproxy.com/https://github.com/04ing/UAV.git && git fetch origin main 2>&1)\n" +
  "git reset --hard origin/main\n" +
  "git clean -fd\n" +
  "echo '新版本:' && git log -1 --pretty=format:'%h %s' && echo ''\n" +
  "echo '检查依赖更新...'\n" +
  "if [ -f package-lock.json ]; then npm ci --omit=dev 2>/dev/null || npm install --production=false 2>/dev/null || npm install; fi\n" +
  "mkdir -p logs data/store\n" +
  "echo 'PM2 reload...'\n" +
  "pm2 reload uav-backend 2>/dev/null || pm2 start ecosystem.config.js --env production\n" +
  "pm2 save\n";

const verifyCmd =
  "sleep 3\n" +
  "echo '--- PM2 状态 ---'\n" +
  "pm2 status 2>/dev/null\n" +
  "echo '--- 端口 4000 ---'\n" +
  "(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep ':4000' || echo '端口 4000 未监听'\n" +
  "echo '--- HTTP 探活 ---'\n" +
  "(curl -sSf -m 5 http://127.0.0.1:4000/api/meta 2>&1 | head -c 500 && echo '') || echo 'HTTP 无响应'\n";

function runCommand(conn, title, cmd) {
  return new Promise((resolve, reject) => {
    console.log('\n-------------------------------------------------------');
    console.log('▶  ' + title);
    console.log('-------------------------------------------------------');
    conn.exec(cmd, { pty: true }, (err, stream) => {
      if (err) return reject(err);
      stream.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('命令失败，退出码: ' + code));
      }).on('data', (data) => process.stdout.write(data))
        .stderr.on('data', (data) => process.stderr.write(data));
    });
  });
}

async function main() {
  const conn = new Client();
  console.log('🚀 连接阿里云服务器...');
  await new Promise((resolve, reject) => {
    conn
      .on('ready', () => { console.log('✅ SSH 已连接'); resolve(); })
      .on('error', (err) => reject(err))
      .connect(config);
  });

  try {
    await runCommand(conn, '步骤1：拉取最新代码 + 更新依赖', deployCmd);
    await runCommand(conn, '步骤2：验证服务状态', verifyCmd);

    console.log('\n====================================================');
    console.log('  ✅ 部署完成');
    console.log('====================================================');
    console.log('  🌐 访问:   http://47.103.29.77:4000');
    console.log('  🔍 日志:   ssh root@47.103.29.77 "pm2 logs uav-backend --lines 50"');
    console.log('  ⏹  停止:   ssh root@47.103.29.77 "pm2 stop uav-backend"');
    console.log('  🔁 重启:   ssh root@47.103.29.77 "pm2 reload uav-backend"');
    console.log('====================================================');
  } catch (e) {
    console.error('\n❌ 部署失败:', e.message);
    process.exitCode = 1;
  } finally {
    conn.end();
  }
}

main();
