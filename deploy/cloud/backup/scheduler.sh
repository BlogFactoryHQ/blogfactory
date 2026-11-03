#!/bin/sh
set -eu

state_dir=/var/lib/blogfactory-backup
mkdir -p "$state_dir"

while true; do
  if ! /usr/local/bin/backup.sh; then
    sleep 300 &
    wait "$!"
    continue
  fi

  day=$(date -u +%d)
  weekday=$(date -u +%u)
  month=$(date -u +%Y-%m)
  restore_marker="$state_dir/restore-month"
  if [ "$day" -le 7 ] && [ "$weekday" -eq 7 ] && [ "$(cat "$restore_marker" 2>/dev/null || true)" != "$month" ]; then
    if /usr/local/bin/restore-check.sh; then
      rm -f "$state_dir/restore-failed"
      printf '%s\n' "$month" > "$restore_marker"
    else
      touch "$state_dir/restore-failed"
    fi
  fi

  if [ ! -f "$state_dir/restore-failed" ] && [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
    curl --fail --silent --show-error --max-time 10 "$BACKUP_HEARTBEAT_URL" >/dev/null || echo "backup_heartbeat_failed"
  fi

  sleep "${BACKUP_INTERVAL_SECONDS:-21600}" &
  wait "$!"
done
