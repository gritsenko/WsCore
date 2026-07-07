#!/usr/bin/env bash
#
# Stop the WsCore stack started by scripts/dev-up.sh.
#   dev-down.sh          # stop both server (:5000) and client (:5173)
#   dev-down.sh server   # stop only the server (used by the reconnect test)
#   dev-down.sh client   # stop only the client
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.run"

target="${1:-all}"
case "$target" in
  server) ports=(5000) ;;
  client) ports=(5173) ;;
  all) ports=(5000 5173) ;;
  *) echo "usage: dev-down.sh [server|client|all]"; exit 1 ;;
esac

for port in "${ports[@]}"; do
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "stopping :$port ($pids)"
    kill $pids 2>/dev/null || true
  else
    echo ":$port not listening"
  fi
done

if [ "$target" = "all" ]; then
  rm -f "$RUN"/*.pid 2>/dev/null || true
fi
