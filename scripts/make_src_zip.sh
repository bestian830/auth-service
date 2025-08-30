#!/usr/bin/env bash
set -euo pipefail

# —— 可配置 —— #
ZIP_PREFIX="auth-service"
OUT_DIR="/tmp"

# 规避 macOS 资源叉
export COPYFILE_DISABLE=1

# 进入仓库根（若在子目录执行）
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# 记录分支/commit
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
NAME="${ZIP_PREFIX}-${BRANCH}-${COMMIT}-src"
ZIP_PATH="${OUT_DIR}/${NAME}.zip"

echo "==> Preparing source list..."
# 优先使用 git 跟踪文件，防止把未追踪的临时文件/缓存打进去
git ls-files > /tmp/filelist.raw

# 过滤黑名单（双保险）
grep -vE '^(node_modules/|dist/|build/|coverage/|\.turbo/|\.next/|\.git/|\.gitignore|\.DS_Store|Thumbs\.db|__MACOSX/|\.env\.local|\.env\.development|\.env\.production|\.env\.test|\.env$|.+\.log$|tmp/|\.cache/|.+\.swp$|.+\.tmp$)' \
  /tmp/filelist.raw > /tmp/filelist.filtered

# 必须包含的关键文件兜底检查
REQUIRED_FILES=(package.json tsconfig.json prisma/schema.prisma zip.md .env.example src)
for f in "${REQUIRED_FILES[@]}"; do
  if ! grep -qx "$f" /tmp/filelist.filtered && ! grep -q "^${f}/" /tmp/filelist.filtered; then
    echo "ERROR: required path missing in git index -> $f"
    echo "Hint: ensure it's committed, or add it before packaging."
    exit 1
  fi
done

# 可选锁文件（存在则包含）
for lock in package-lock.json pnpm-lock.yaml yarn.lock; do
  if [ -f "$lock" ] && ! grep -qx "$lock" /tmp/filelist.filtered; then
    echo "$lock" >> /tmp/filelist.filtered
  fi
done

# 排除符号链接（拒绝 symlink）
echo "==> Checking for symlinks..."
while IFS= read -r path; do
  [ -L "$path" ] && { echo "ERROR: symlink detected -> $path"; exit 1; }
done < /tmp/filelist.filtered

# 快速编译验证（可注释掉）
echo "==> npm ci && npm run build (quick validation)..."
npm ci
npm run build

# 打包
echo "==> Zipping ${ZIP_PATH} ..."
zip -X -9 -@ "$ZIP_PATH" < /tmp/filelist.filtered

# 自检：AppleDouble / 省略号污染 / CRLF
echo "==> Post-checks..."
unzip -t "$ZIP_PATH" >/dev/null
unzip -l "$ZIP_PATH" | head -n 30

# 省略号污染（...）
( unzip -p "$ZIP_PATH" prisma/schema.prisma | grep -n '\.\.\.' ) && \
  { echo "WARN: '...' found in prisma/schema.prisma (check truncation)"; } || \
  echo "OK: no '...' in prisma/schema.prisma"

( unzip -p "$ZIP_PATH" src/config/env.ts | grep -n '\.\.\.' ) && \
  { echo "WARN: '...' found in src/config/env.ts (check truncation)"; } || \
  echo "OK: no '...' in src/config/env.ts"

# CRLF 检测（显示前几个命中行号）
if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' "$ZIP_PATH"
import sys, zipfile, re
z=zipfile.ZipFile(sys.argv[1])
crlf = []
for i in z.infolist():
    if i.is_dir(): continue
    if not i.filename.endswith(('.ts','.tsx','.js','.json','.md','.prisma','.yaml','.yml','.html','.css','.sql')):
        continue
    data = z.read(i.filename)
    if b'\r\n' in data:
        crlf.append(i.filename)
if crlf:
    print("WARN: CRLF line endings in:", *crlf[:10], "...(truncated)" if len(crlf)>10 else "")
else:
    print("OK: no CRLF endings detected")
PY
fi

# SHA256
echo "==> SHA256:"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ZIP_PATH"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ZIP_PATH"
fi

echo "DONE -> $ZIP_PATH"