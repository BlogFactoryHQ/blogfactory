#!/bin/sh
set -eu

. /usr/local/bin/backup-lib.sh
require_backup_env
: "${BACKUP_AGE_RECIPIENT:?}"

state_dir=/var/lib/blogfactory-backup
mkdir -p "$state_dir"
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

timestamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
base="blogfactory-${timestamp}"
dump="$work_dir/${base}.dump"
encrypted="$dump.age"
manifest="$work_dir/${base}.manifest"
six_hour_key="${BACKUP_R2_PREFIX}/six-hour/${base}.dump.age"

pg_dump --format=custom --no-owner --no-acl --file="$dump"
age -r "$BACKUP_AGE_RECIPIENT" -o "$encrypted" "$dump"

{
  printf 'format=blogfactory-backup-v1\n'
  printf 'created_at=%s\n' "$timestamp"
  printf 'database=%s\n' "$PGDATABASE"
  printf 'dump_bytes=%s\n' "$(wc -c < "$dump" | tr -d ' ')"
  printf 'encrypted_sha256=%s\n' "$(sha256sum "$encrypted" | awk '{print $1}')"
  printf 'migration_count=%s\n' "$(psql -X -A -t -q -c 'SELECT count(*) FROM schema_migrations')"
  printf 'migration_sha256=%s\n' "$(migration_fingerprint)"
  table_counts
} > "$manifest"

s3 s3 cp "$encrypted" "s3://${S3_BUCKET}/${six_hour_key}" --only-show-errors
s3 s3 cp "$manifest" "s3://${S3_BUCKET}/${BACKUP_R2_PREFIX}/six-hour/${base}.manifest" --only-show-errors
s3 s3api head-object --bucket "$S3_BUCKET" --key "$six_hour_key" >/dev/null
s3 s3api head-object --bucket "$S3_BUCKET" --key "${BACKUP_R2_PREFIX}/six-hour/${base}.manifest" >/dev/null
remote_sha=$(s3 s3 cp "s3://${S3_BUCKET}/${six_hour_key}" - --only-show-errors | sha256sum | awk '{print $1}')
test "$remote_sha" = "$(sha256sum "$encrypted" | awk '{print $1}')"
remote_manifest_sha=$(s3 s3 cp "s3://${S3_BUCKET}/${BACKUP_R2_PREFIX}/six-hour/${base}.manifest" - --only-show-errors | sha256sum | awk '{print $1}')
test "$remote_manifest_sha" = "$(sha256sum "$manifest" | awk '{print $1}')"

promotion_periods "$timestamp" | while IFS=: read -r tier period; do
  marker="$state_dir/${tier}-period"
  test "$(cat "$marker" 2>/dev/null || true)" = "$period" && continue
  target_base="${BACKUP_R2_PREFIX}/${tier}/${base}"
  s3 s3api copy-object --bucket "$S3_BUCKET" --copy-source "${S3_BUCKET}/${six_hour_key}" --key "${target_base}.dump.age" >/dev/null
  s3 s3api copy-object --bucket "$S3_BUCKET" --copy-source "${S3_BUCKET}/${BACKUP_R2_PREFIX}/six-hour/${base}.manifest" --key "${target_base}.manifest" >/dev/null
  printf '%s\n' "$period" > "$marker"
done

for tier_keep in six-hour:28 daily:7 weekly:4 monthly:3; do
  tier=${tier_keep%:*}
  keep=${tier_keep#*:}
  objects="$work_dir/${tier}.objects"
  old_objects="$work_dir/${tier}.old"
  s3 s3 ls "s3://${S3_BUCKET}/${BACKUP_R2_PREFIX}/${tier}/" --recursive > "$objects"
  awk '$4 ~ /\.dump\.age$/ { print $4 }' "$objects" | sort | retention_candidates "$keep" > "$old_objects"
  while IFS= read -r old_key; do
    test -n "$old_key" || continue
    s3 s3 rm "s3://${S3_BUCKET}/${old_key}" --only-show-errors
    s3 s3 rm "s3://${S3_BUCKET}/${old_key%.dump.age}.manifest" --only-show-errors
  done < "$old_objects"
done

touch "$state_dir/last-success"
printf 'backup_ok created_at=%s\n' "$timestamp"
