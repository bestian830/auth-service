#!/usr/bin/env bash
set -euo pipefail

export COPYFILE_DISABLE=1  # macOS 禁止 AppleDouble
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
NAME="auth-service-${BRANCH}-${COMMIT}-src"
STAGE="/tmp/${NAME}"

rm -rf "$STAGE"
mkdir -p "$STAGE"

# 只同步允许的文件
rsync -a --delete \
--prune-empty-dirs \
--include='package.json' \
--include='package-lock.json' \
--include='tsconfig.json' \
--include='.env.example' \
--include='prisma/' \
--include='prisma/schema.prisma' \
--include='src/***' \
--exclude='*' \
./ "$STAGE/"

# 生成 zip.md
cat > "$STAGE/zip.md" <<'MD'
# Source Bundle Manifest (zip.md)

- Project: auth-service
- Branch : {{BRANCH}}
- Commit : {{COMMIT}}
- Created: {{CREATED_AT}}

## Includes

- package.json
- package-lock.json
- tsconfig.json
- .env.example
- prisma/schema.prisma
- src/**

## Excludes

- node_modules/, dist/, build/, coverage/, .turbo/, .next/
- .git/, .DS_Store, Thumbs.db
- .env, .env.local, .env.*
- logs, tmp/, .cache/

## Notes

- UTF-8, LF; no symlink; no AppleDouble.
MD

sed -i '' -e "s/{{BRANCH}}/${BRANCH}/g" "$STAGE/zip.md" 2>/dev/null || sed -i "s/{{BRANCH}}/${BRANCH}/g" "$STAGE/zip.md"
sed -i '' -e "s/{{COMMIT}}/${COMMIT}/g" "$STAGE/zip.md" 2>/dev/null || sed -i "s/{{COMMIT}}/${COMMIT}/g" "$STAGE/zip.md"
sed -i '' -e "s/{{CREATED_AT}}/$(date -u +%Y-%m-%dT%H:%M:%SZ)/g" "$STAGE/zip.md" 2>/dev/null || sed -i "s/{{CREATED_AT}}/$(date -u +%Y-%m-%dT%H:%M:%SZ)/g" "$STAGE/zip.md"

# 打包
cd /tmp
zip -X -9 -r -q "${NAME}.zip" "${NAME}"

# 校验
SHA256="$(shasum -a 256 "/tmp/${NAME}.zip" | awk '{print $1}')"
echo "Generated: /tmp/${NAME}.zip"
echo "SHA256   : $SHA256"
unzip -t "/tmp/${NAME}.zip" >/dev/null && echo "ZIP OK"