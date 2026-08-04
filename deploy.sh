#!/usr/bin/env bash
# ================================================================
# 无人机巡检系统 - 阿里云一键部署脚本
# 目标机器要求: Ubuntu / Debian / CentOS (已安装 Node.js 18+, git, pm2)
# 执行: bash deploy.sh
# ================================================================

set -e

PROJECT_DIR="/opt/UAV"
REPO_URL="https://github.com/04ing/UAV.git"
BRANCH="main"
PM2_APP="uav-backend"

echo "=========================================="
echo "  UAV System - Production Deploy (阿里云一键部署"
echo "=========================================="

# 1. 检查 node / 安装依赖
echo ""
echo "[1/6] 检查运行环境..."
command -v node >/dev/null 2>&1 || { echo "❌ node 未安装，请先安装 Node.js 18+"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "❌ npm 未安装";  exit 1; }
command -v git  >/dev/null 2>&1 || { echo "❌ git 未安装，请 apt-get install -y git"; exit 1; }
command -v pm2  >/dev/null 2>&1 || {
  echo "⚠️  pm2 未安装，正在全局安装...";
  npm i -g pm2;
}
mkdir -p logs
echo "✅ Node $(node -v) / npm $(npm -v) / pm2 $(pm2 -v)"

# 2. 拉取 / 更新代码
echo ""
echo "[2/6] 拉取仓库代码 (${REPO_URL})..."
if [ -d "${PROJECT_DIR}" ]; then
  cd "${PROJECT_DIR}"
  echo "   目录已存在，执行 git pull..."
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  git clean -fd
else
  echo "   克隆仓库到 ${PROJECT_DIR}..."
  git clone -b "${BRANCH}" --depth=1 "${REPO_URL}" "${PROJECT_DIR}"
  cd "${PROJECT_DIR}"
fi
echo "✅ 当前版本: $(git log -1 --pretty=format:'%h %s')"

# 3. 安装依赖
echo ""
echo "[3/6] 安装后端依赖 (npm ci || npm install)..."
if [ -f package-lock.json ]; then
  npm ci --omit=dev 2>/dev/null || npm install --production=false 2>/dev/null || npm install
else
  npm install
fi
echo "✅ 依赖安装完成"

# 4. 初始化数据目录 (首次启动会自动 seed 用户和示例无人机)
echo ""
echo "[4/6] 初始化数据目录..."
mkdir -p data/store logs
echo "✅ 目录就绪"

# 5. 启动 / 重启 PM2 服务
echo ""
echo "[5/6] 启动服务 (PM2, 端口 4000)..."
if pm2 describe "${PM2_APP}" >/dev/null 2>&1; then
  echo "   进程已存在，执行 reload..."
  pm2 reload ecosystem.config.js --env production
else
  echo "   首次启动..."
  pm2 start ecosystem.config.js --env production
fi
pm2 save 2>/dev/null || true

# 6. 配置开机自启 (如未设置)
echo ""
echo "[6/6] 检查开机自启 (systemd/pm2 startup)..."
STARTUP_LINE=$(pm2 startup systemd -u root --hp /root 2>&1 | grep -E "^sudo" | head -1 || true)
if [ -n "${STARTUP_LINE}" ]; then
  echo "   如需开机自启，请在 root 下执行以下命令:"
  echo "   ${STARTUP_LINE}"
else
  echo "   已配置或不需要"
fi

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo "  服务进程:  pm2 status / pm2 logs ${PM2_APP}"
echo "  访问地址:  http://$(curl -s ifconfig.me 2>/dev/null || echo '47.103.29.77'):4000"
echo "  停止服务:  pm2 stop ${PM2_APP}"
echo "  查看日志:  pm2 logs ${PM2_APP} --lines 100"
echo "=========================================="
