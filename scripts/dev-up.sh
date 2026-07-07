#!/usr/bin/env bash
#
# Start the WsCore stack (server :5000 + client :5173) in the background for
# automated browser testing, then wait until both ports are listening.
# Logs and pids go to .run/. Stop with scripts/dev-down.sh.
#
# For interactive development, prefer two terminals (see CLAUDE.md); this helper
# exists so an agent can bring the whole stack up for the browser smoke test.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.run"
mkdir -p "$RUN"

listening() { lsof -ti "tcp:$1" >/dev/null 2>&1; }

start() {
  local name="$1" port="$2" dir="$3" cmd="$4"
  if listening "$port"; then
    echo "$name already listening on :$port"
    return
  fi
  nohup bash -c "cd '$ROOT/$dir' && exec $cmd" >"$RUN/$name.log" 2>&1 &
  echo $! >"$RUN/$name.pid"
  disown || true
  echo "started $name (pid $(cat "$RUN/$name.pid")) -> $RUN/$name.log"
}

start server 5000 "WsServer/WsServer" "dotnet run"
start client 5173 "WsCore.Client" "npm start"

printf 'waiting for :5000 and :5173'
for _ in $(seq 1 90); do
  if listening 5000 && listening 5173; then
    echo ' ... up'
    echo 'open http://localhost:5173'
    exit 0
  fi
  printf '.'
  sleep 1
done
echo ' ... timeout (check .run/*.log)'
exit 1
