#!/usr/bin/env bash
# Run as wscore-deploy on the target; archive must be a CI-produced Linux release.
set -euo pipefail
umask 022
sha=${1:?Expected commit SHA}
archive=${2:?Expected archive path}
[[ $sha =~ ^[0-9a-f]{40}$ ]] || exit 64
[[ $archive == /opt/wscore/incoming/"$sha".tar.gz ]] || exit 64
base=/opt/wscore
exec 9>"$base/.deploy.lock"
flock -w 120 9
cd "$base/incoming"
sha256sum --check "$sha.tar.gz.sha256"
release="$base/releases/$sha"
previous=$(readlink -f "$base/current" || true)
switched=0
health() {
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 2 http://192.168.1.215:5080/health; then
      return 0
    fi
    sleep 1
  done
  return 1
}
switch_to() {
  ln -sfn "$1" "$base/.current-next"
  mv -Tf "$base/.current-next" "$base/current"
}
restart() {
  # A bad executable can exhaust systemd's start limit before rollback.
  sudo /usr/bin/systemctl reset-failed wscore.service
  sudo /usr/bin/systemctl restart wscore.service
}
rollback() {
  status=$?
  trap - EXIT
  if (( status != 0 && switched == 1 )); then
    if [[ -n $previous && -d $previous ]]; then
      echo "Deployment failed; restoring $previous" >&2
      switch_to "$previous"
      if ! restart || ! health; then
        echo "Rollback health check failed" >&2
      fi
    else
      sudo /usr/bin/systemctl stop wscore.service
      echo "First deployment failed; no previous release exists" >&2
    fi
  fi
  exit "$status"
}
trap rollback EXIT
if [[ ! -d $release ]]; then
  staging=$(mktemp -d "$base/releases/.staging-$sha.XXXXXX")
  tar --extract --gzip --file "$archive" --directory "$staging" --no-same-owner
  test -x "$staging/WsServer"
  test -f "$staging/wwwroot/index.html"
  test "$(cat "$staging/commit.txt")" = "$sha"
  chmod -R a+rX "$staging"
  mv "$staging" "$release"
fi
switched=1
switch_to "$release"
restart
health
printf '\nActive release: %s\n' "$sha"
