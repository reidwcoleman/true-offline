#!/bin/zsh
# Rebuild the service worker manifest, then screenshot + offline-test against localhost:4780.
# usage: tools/test.sh <screenshot dir>
cd "${0:A:h}/.."
python3 tools/build_sw.py
export CHROME="$HOME/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
node tools/shot.mjs "$1"
