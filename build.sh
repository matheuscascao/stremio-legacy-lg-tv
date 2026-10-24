#!/bin/bash
# Builds a webOS app from Stremio's legacy v4 web UI, patched to run on Chromium 38 (webOS TV Lite).
# Uses the copy saved in vendor/shell-v4.4; --refresh re-downloads it from app.strem.io first.
# Install on the TV: ares-install -d tv com.matheus.stremio_*.ipk
set -euo pipefail
cd "$(dirname "$0")"
BASE=https://app.strem.io/shell-v4.4/
UP=vendor/shell-v4.4
OUT=dist

if [ "${1:-}" = "--refresh" ]; then
  curl -fsSL "$BASE" -o "$UP/index.html"
  JS=$(grep -oE 'src="blob\.js[^"]*"' "$UP/index.html" | cut -d'"' -f2)
  CSS=$(grep -oE 'href="blob\.css[^"]*"' "$UP/index.html" | cut -d'"' -f2)
  curl -fsSL "$BASE$JS" -o "$UP/blob.js"
  curl -fsSL "$BASE$CSS" -o "$UP/blob.css"
  while read -r asset; do mkdir -p "$UP/$(dirname "$asset")"; curl -fsSL "$BASE$asset" -o "$UP/$asset"; done < "$UP/assets.txt"
fi

rm -rf "$OUT"
mkdir -p "$OUT"
npx babel "$UP/blob.js" --no-babelrc --config-file ./babel.config.json --out-file "$OUT/blob.js"
# newline between files: core-js ends in a sourceMappingURL comment that would swallow the next line
{ cat node_modules/core-js-bundle/minified.js; printf '\n;\n'; cat node_modules/whatwg-fetch/dist/fetch.umd.js; } > "$OUT/polyfill.js"
node patch.js "$UP" "$OUT"
cp -R "$UP/images" "$UP/fonts" "$OUT/"
cp app/appinfo.json app/icon.png tv.js tv.css "$OUT/"
ares-package -n "$OUT" -o .
