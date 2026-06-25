#!/usr/bin/env bash
# 停止 OpenCode 后台服务（launchd 管理的进程也会被结束）
set -euo pipefail

PORT="${OPENCODE_PORT:-14096}"

pids=$(lsof -t -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
if [[ -z "$pids" ]]; then
  echo "OpenCode serve 未在端口 $PORT 上运行"
  exit 0
fi

echo "停止 OpenCode serve (PID: $pids)..."
kill $pids 2>/dev/null || true
sleep 1
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  kill -9 $pids 2>/dev/null || true
fi
echo "已停止"
