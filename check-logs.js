const { Client } = require('ssh2');

const config = {
  host: '47.103.29.77',
  port: 22,
  username: 'root',
  password: 'SKFing_11040922',
  readyTimeout: 20000,
};

const conn = new Client();
conn.on('ready', () => {
  // 查看 PM2 日志最近 50 行
  conn.exec('pm2 logs uav-backend --lines 50 --nostream', (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', (d) => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).connect(config);
