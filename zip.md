# Source Bundle Manifest (zip.md)

## 目标

- 交付**最小可审阅源码包**：只含源码与配置，排除依赖与构建产物。
- 任何环境下可可靠解压：无符号链接、无 AppleDouble 资源叉、无隐藏垃圾文件。
- 包内含本 `zip.md` 以便快速核对内容与生成流程。

## 包命名

- `auth-service-<branch>-<short-commit>-src.zip`
- 例：`auth-service-v0.2.5-3f7a1c2-src.zip`

## 必须包含（白名单）

- `zip.md`（本文档）
- `package.json`，以及锁文件（`package-lock.json`/`pnpm-lock.yaml`/`yarn.lock` 之一）
- `tsconfig.json`，`.eslintrc.*`（如有）
- `.env.example`（严禁包含真实 `.env`）
- `src/**`（全量源码：controllers, services, middleware, routes, infra, config, types, scripts…）
- `prisma/schema.prisma`
- （可选）`prisma/migrations/**`（若需我评审迁移）
- （可选）`src/views/login.html`（如演示浏览器授权流）

## 必须排除（黑名单）

- 依赖与构建产物：`node_modules/`，`dist/`，`build/`，`.turbo/`，`.next/`，`coverage/`
- VCS 与系统垃圾：`.git/`，`.gitignore`，`.DS_Store`，`Thumbs.db`，`__MACOSX/`
- 运行时/隐私文件：`.env`、`.env.local`、`.env.*`（除 `.env.example`）
- 临时/缓存/日志：`.log`，`tmp/`，`.cache/`，`.swp`，`.tmp`
- 符号链接（symlink）一律禁止

## 文本与行尾

- 全部文本文件 UTF-8 编码，LF（`\n`）行尾（不要 CRLF）
- 不包含二进制/不可读内容（除非明确说明）

## 体积建议

- 推荐 ≤ 25 MB；如超过，请按"必须排除"进行瘦身或把迁移/样例数据拆到第二个包

## 生成方式（macOS/Linux）

> 推荐：脚本化，使用仓库内的 scripts/make_src_zip.sh（见下方脚本示例）

**或**手动命令（若无脚本）：

```bash
# 清理构建产物（可选）
rm -rf dist

# 快速编译验证（确保 TS/依赖健康）
npm ci
npm run build

# 用 git 跟踪文件构建清单（避免未跟踪临时文件）
git ls-files \
  ':!:node_modules' \
  ':!:dist' \
  ':!:.git' \
  ':!:.env' \
  ':!:*.log' \
  ':!:**/*.map' \
  > /tmp/filelist.txt

# 打包：-X 去扩展属性；-9 最高压缩；-@ 从清单读取
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
NAME="auth-service-${BRANCH}-${COMMIT}-src"
( cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && zip -X -9 -@ "/tmp/${NAME}.zip" < /tmp/filelist.txt )

# 校验与列出内容
shasum -a 256 "/tmp/${NAME}.zip"
unzip -t "/tmp/${NAME}.zip"
unzip -l "/tmp/${NAME}.zip" | head -n 50
```

**解包验证（你也可以先本地跑一遍）**

```bash
# 完整性测试
unzip -t "/tmp/auth-service-*-src.zip"

# 列表预览
unzip -l "/tmp/auth-service-*-src.zip" | head -50

# 快速探测潜在问题
unzip -p "/tmp/auth-service-*-src.zip" prisma/schema.prisma | grep -n '\.\.\.' || echo "✅ schema 无省略号污染"
unzip -p "/tmp/auth-service-*-src.zip" src/config/env.ts     | grep -n '\.\.\.' || echo "✅ env.ts 无省略号污染"
```

## 运行环境记录

- Node: v
- npm/pnpm/yarn: v
- TypeScript: v

## 目录树（前 50 项）

> 请粘贴：unzip -l /tmp/auth-service-*-src.zip | head -n 50

## 备注

- 无符号链接；无 AppleDouble 资源叉；UTF-8 + LF。
- 若需审阅迁移，请额外提供包含 prisma/migrations/** 的第二个 zip 包。