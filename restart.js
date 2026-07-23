const { execSync, spawn } = require('child_process');
const path = require('path');

const MAIN_PORT = 3000;
const PROJECT_DIR = __dirname;

function killProcessByPort(port) {
    try {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
        const lines = result.trim().split('\n');
        const pids = [];
        
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !pids.includes(pid)) {
                pids.push(pid);
            }
        });
        
        pids.forEach(pid => {
            try {
                execSync(`taskkill /F /PID ${pid}`);
                console.log(`✅ 已终止端口 ${port} 上的进程 (PID: ${pid})`);
            } catch (e) {
                console.log(`⚠️ 终止进程 ${pid} 失败: ${e.message}`);
            }
        });
        
        if (pids.length === 0) {
            console.log(`ℹ️ 端口 ${port} 上没有运行的进程`);
        }
    } catch (e) {
        console.log(`ℹ️ 端口 ${port} 上没有运行的进程`);
    }
}

function startMainServer() {
    console.log('\n🚀 启动主后端服务...');
    const mainServer = spawn('node', ['backend/server.js'], {
        cwd: PROJECT_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    mainServer.stdout.on('data', (data) => {
        console.log(`[MAIN] ${data.toString().trim()}`);
    });
    
    mainServer.stderr.on('data', (data) => {
        console.log(`[MAIN ERR] ${data.toString().trim()}`);
    });
    
    mainServer.on('error', (err) => {
        console.error(`❌ 主后端服务启动失败: ${err.message}`);
    });
    
    mainServer.on('close', (code) => {
        console.log(`📌 主后端服务退出 (码: ${code})`);
    });
    
    return new Promise((resolve) => {
        setTimeout(() => {
            try {
                execSync(`powershell -Command "Test-NetConnection localhost -Port ${MAIN_PORT}"`, { stdio: 'ignore' });
                console.log(`✅ 主后端服务已启动 (端口: ${MAIN_PORT})`);
                resolve(true);
            } catch (e) {
                console.log(`⚠️ 主后端服务启动超时`);
                resolve(false);
            }
        }, 5000);
    });
}

async function main() {
    console.log('========================================');
    console.log('     无人机智能巡检系统 - 服务重启脚本     ');
    console.log('========================================\n');
    
    console.log('🔧 停止现有服务...');
    killProcessByPort(MAIN_PORT);
    
    console.log('\n⏳ 等待端口释放...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await startMainServer();
    
    console.log('\n========================================');
    console.log('     服务启动完成!                        ');
    console.log('========================================');
    console.log(`\n🌐 主后端服务: http://localhost:${MAIN_PORT}`);
    console.log(`🔗 前端页面: http://localhost:${MAIN_PORT}`);
    console.log(`\n👤 默认登录: admin / admin123`);
    console.log(`\n按 Ctrl+C 停止所有服务`);
}

main().catch(err => {
    console.error('❌ 服务重启失败:', err);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n\n📌 用户终止，停止所有服务...');
    killProcessByPort(MAIN_PORT);
    process.exit(0);
});