# **压缩规范（保存为zip.md放在包内根目录）**

## **目标**

- 交付**最小可审阅源码包**：只含源码与配置，排除构建产物与依赖。
- 包在任何环境都能可靠解压（无资源叉、无符号链接问题、无隐藏垃圾文件）。
- 我能通过清单快速确认内容完整性。

## **包命名**

- auth-service-<branch>-<short-commit>-src.zip
- 例：auth-service-v0.2.5-3f7a1c2-src.zip

## **必须包含（只要这些）**

- zip.md（本文档）
- package.json, package-lock.json（如有）
- tsconfig.json, .eslintrc.*（如有）
- .env.example（严禁包含真实 .env）
- src/**（全量源码：controllers, services, middleware, routes, infra, config, types, scripts…）
- prisma/schema.prisma
- （可选）prisma/migrations/** 如果你要我评审迁移

## **必须排除**

- 依赖与构建产物：node_modules/, dist/, build/, .turbo/, .next/, coverage/
- VCS 与系统垃圾：.git/, .gitignore, .DS_Store, Thumbs.db
- 运行时/隐私文件：.env, .env.local, .env.*（除 .env.example）
- 临时/缓存/日志：*.log, tmp/, .cache/, *.swp, *.tmp

## **文件要求**

- 文本用 **UTF-8**，**LF** 行尾
- **不得**包含符号链接（symlink）
- **不得**包含 Mac 资源叉（AppleDouble），避免路径前缀 __MACOSX/
- 路径统一使用**相对路径**，根目录下只有一个项目文件夹（例如 auth-service/…）

## **体积限制**

- **推荐 ≤ 25 MB**（我更容易稳定处理）
- 如超过：请先按"排除清单"瘦身；必要时将迁移/样例数据拆到第二个包

## **生成方式（macOS/Linux）**

1. 在项目根目录执行（推荐）：

```bash
# 确保在项目根
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "$(date +%Y%m%d%H%M%S)")
NAME="auth-service-${BRANCH}-${COMMIT}-src"

mkdir -p /tmp/${NAME}
rsync -a --delete \
  --prune-empty-dirs \
  --include='package.json' \
  --include='package-lock.json' \
  --include='tsconfig.json' \
  --include='.eslintrc.*' \
  --include='.env.example' \
  --include='prisma/' \
  --include='prisma/schema.prisma' \
  --include='src/***' \
  --exclude='*' \
  ./ /tmp/${NAME}/

# 生成 zip.md（下面有模板）
cp zip.md /tmp/${NAME}/

# 最终打包：-X 去扩展属性，-9 最高压缩，-r 递归，-q 静默
cd /tmp && zip -X -9 -r -q "${NAME}.zip" "${NAME}"

# 打印校验与内容
shasum -a 256 "/tmp/${NAME}.zip"
unzip -l "/tmp/${NAME}.zip" | head -n 50
echo "DONE -> /tmp/${NAME}.zip"
```

2. **或**用 git archive（不包含未提交文件）：

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT=$(git rev-parse --short HEAD)
NAME="auth-service-${BRANCH}-${COMMIT}-src"
git archive --format=zip --output="/tmp/${NAME}.zip" HEAD \
  package.json package-lock.json tsconfig.json .env.example \
  prisma/schema.prisma src
shasum -a 256 "/tmp/${NAME}.zip"
```

**解包验证命令（你也可以先跑一下）**

```bash
unzip -t "/tmp/<your_zip>.zip"             # 完整性测试
unzip -l "/tmp/<your_zip>.zip" | head -50  # 列表预览
```

**zip.md 模板（复制这段放进包里）**

```markdown
# Source Bundle Manifest

## Meta

- Project: auth-service
- Branch: <branch-name>
- Commit: <full-commit-sha>
- CreatedAt: <ISO8601>
- ZipName: <auth-service-branch-commit-src.zip>
- SHA256: <zip-file-sha256>

## Build / Runtime

- Node: v<your-version>
- npm: v<your-version>
- Typescript: v<ts-version>

## Include

- package.json
- package-lock.json
- tsconfig.json
- .env.example
- prisma/schema.prisma
- src/**

## Exclude

- node_modules/, dist/, build/, coverage/, .turbo/, .next/
- .git/, .DS_Store, Thumbs.db
- .env, .env.local, .env.*
- .log, tmp/, .cache/

## Tree (top 50)

<粘贴 `unzip -l <zip> | head -n 50` 输出或 `tree -L 2` 精简树>

## Notes

- 无符号链接；无 AppleDouble；UTF-8 + LF。
- 若需审阅迁移，请单独提供 second zip（migrations 专包）。
```

## **你要做的事（一句话）**

- 让 Claude Code 把上面"压缩规范（zip.md）+打包脚本"固化到你的仓库根目录；
- 每次发包前按 **"生成方式"** 产出 zip，包里必须带 zip.md；
- 把 /tmp/...-src.zip 发我，我就能顺利解压和审阅。