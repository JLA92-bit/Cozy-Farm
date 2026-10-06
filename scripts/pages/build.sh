#!/usr/bin/env bash
# Builds the whole GitHub Pages site into dist/: the Cozy Acres website at the root, the game at play/ and the
# private admin dashboard at admin/.
# Used by .github/workflows/deploy.yml; also handy locally (see DOMAIN.md).
#
#   BASE_PATH_ROOT=""           custom domain (https://cozyacres.joshmakesgames.app/)     <- default
#   BASE_PATH_ROOT=/Cozy-Farm   github.io project URL (https://jla92-bit.github.io/Cozy-Farm/)
#   SITE_URL=https://...        full site address, no trailing slash
#   ANDROID_PACKAGE / ANDROID_CERT_SHA256   optional: write .well-known/assetlinks.json (Android app link)
#
# Skips the game's type check (run `npx tsc --noEmit` / npm run build for that).
set -euo pipefail
cd "$(dirname "$0")/../.."
root="${BASE_PATH_ROOT:-}"
root="${root%/}"
site_url="${SITE_URL:-https://cozyacres.joshmakesgames.app}"
site_url="${site_url%/}"

rm -rf dist
echo "== game: base ${root}/play/"
BASE_PATH="${root}/play/" node node_modules/vite/bin/vite.js build --outDir dist/play --emptyOutDir

echo "== admin dashboard: ${root}/admin/ (ADMIN.md)"
node node_modules/vite/bin/vite.js build --config admin/vite.config.ts --emptyOutDir

echo "== website: base ${root}/  url ${site_url}"
SITE_BASE="${root}/" SITE_URL="${site_url}" OUT_DIR=dist/.site SITE_CHANGELOG=src/data/changelog.json \
  python3 design/cozy-acres-website/build.py
cp -R dist/.site/. dist/
rm -rf dist/.site

# the old game's service worker lived at <root>/sw.js: replace it with one that removes itself
cp scripts/pages/legacy-sw.js dist/sw.js
# serve files as they are (no Jekyll processing; keeps .well-known)
touch dist/.nojekyll
# Cloudflare Pages: cache rules and headers (_headers is not served as a file)
cp scripts/pages/_headers dist/_headers

if [ -n "${ANDROID_CERT_SHA256:-}" ] && [ -n "${ANDROID_PACKAGE:-}" ]; then
  mkdir -p dist/.well-known
  python3 - "$ANDROID_PACKAGE" "$ANDROID_CERT_SHA256" > dist/.well-known/assetlinks.json <<'PY'
import json, sys
pkg, fps = sys.argv[1], [f.strip().upper() for f in sys.argv[2].replace(";", ",").split(",") if f.strip()]
print(json.dumps([{"relation": ["delegate_permission/common.handle_all_urls"],
                   "target": {"namespace": "android_app", "package_name": pkg, "sha256_cert_fingerprints": fps}}], indent=2))
PY
  echo "== wrote .well-known/assetlinks.json for ${ANDROID_PACKAGE}"
elif [ -f android/assetlinks.json ] && grep -Eq '([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}' android/assetlinks.json; then
  # a ready-made file with a real fingerprint (not a placeholder)
  mkdir -p dist/.well-known
  cp android/assetlinks.json dist/.well-known/assetlinks.json
  echo "== copied android/assetlinks.json to .well-known/"
fi
echo "== done: dist/"
