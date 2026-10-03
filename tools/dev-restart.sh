#!/usr/bin/env bash
# restart the background vite dev server used by tools/shot.mjs
PIDF=/tmp/claude-0/vite.pid
if [ -f $PIDF ]; then kill "$(cat $PIDF)" 2>/dev/null || true; fi
for p in $(pgrep -f "node.*vite/bin/vite.js --port 5173"); do kill $p 2>/dev/null; done
sleep 1
cd "$(dirname "$0")/.." && (setsid node node_modules/vite/bin/vite.js --port 5173 > /tmp/claude-0/vite.log 2>&1 & echo $! > $PIDF)
sleep 4
