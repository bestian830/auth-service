# ==================== Build Stage ====================
FROM node:20-alpine AS builder

# 安装 OpenSSL 3.x (Alpine 默认版本)
RUN apk add --no-cache openssl-dev openssl

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./
COPY tsconfig.json ./

# 安装依赖（包括dev依赖用于构建）
RUN npm ci

# 复制源代码
COPY src/ ./src/
COPY prisma/ ./prisma/

# 生成Prisma客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# ==================== Production Stage ====================
FROM node:20-alpine AS production

# 安装必要的系统包（包括 OpenSSL 3.x）
RUN apk add --no-cache \
    curl \
    postgresql-client \
    openssl \
    && rm -rf /var/cache/apk/*

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S authuser -u 1001

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 从builder阶段复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# 创建日志目录
RUN mkdir -p /app/logs && \
    chown -R authuser:nodejs /app

# 切换到非root用户
USER authuser

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# 启动命令
CMD ["node", "dist/index.js"]