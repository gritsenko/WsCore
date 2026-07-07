#!/usr/bin/env bash
#
# Stop the WsCore stack started by scripts/dev-up.sh.
#   dev-down.sh          # stop both server (:5000) and client
#   dev-down.sh server   # stop only the server (used by the reconnect test)
#   dev-down.sh client   # stop only the client
#
# The client port is read from .run/client.port (written by dev-up.sh), defaulting
# to 5173.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.run"
CLIENT_PORT="$(cat "$RUN/client.port" 2>/dev/null || echo 5173)"

target="${1:-all}"
case "$target" in
  server) ports=(5000) ;;
  client) ports=("$CLIENT_PORT") ;;
  all) ports=(5000 "$CLIENT_PORT") ;;
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
