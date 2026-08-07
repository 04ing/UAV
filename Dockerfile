# ============ 阶段1: 构建依赖 ============
FROM node:18-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ============ 阶段2: 生产镜像 ============
FROM node:18-alpine AS runner
WORKDIR /app

# 安装 tini 作为 init 进程，正确处理信号
RUN apk add --no-cache tini

# 创建非 root 用户
RUN addgroup -S app && adduser -S app -G app

# 复制 node_modules
COPY --from=deps /app/node_modules ./node_modules

# 复制项目文件
COPY package.json ./
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY ecosystem.config.js ./

# 创建数据和日志目录
RUN mkdir -p data/store logs && chown -R app:app /app

USER app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/healthz',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/server.js"]
