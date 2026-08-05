/**
 * 查看阿里云服务器 PM2 日志
 */
const { Client } = require('ssh2');

const conn = new Client();
const cmd = "pm2 logs uav-backend --lines 80 --nostream 2>&1";

conn.on('ready', () => {
  console.log('✅ SSH 已连接，拉取 PM2 日志...\n');
  conn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) { console.error(err); process.exit(1); }
    stream.on('close', () => { conn.end(); });
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
  });
}).on('error', (e) => { console.error('SSH 错误:', e.message); process.exit(1); })
.connect({ host: '47.103.29.77', port: 22, username: 'root', password: 'SKFing_11040922', readyTimeout: 15000 });
