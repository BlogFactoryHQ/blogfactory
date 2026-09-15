#!/bin/sh
set -eu

. /usr/local/bin/backup-lib.sh
require_backup_env
: "${BACKUP_AGE_IDENTITY_FILE:?}"
test -r "$BACKUP_AGE_IDENTITY_FILE"

state_dir=/var/lib/blogfactory-backup
mkdir -p "$state_dir"
work_dir=$(mktemp -d)
scratch="blogfactory_restore_check_$(date -u +%Y%m%d%H%M%S)"
cleanup() {
  dropdb --if-exists "$scratch" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM

objects="$work_dir/six-hour.objects"
s3 s3 ls "s3://${S3_BUCKET}/${BACKUP_R2_PREFIX}/six-hour/" --recursive > "$objects"
latest_key=$(awk '$4 ~ /\.dump\.age$/ { print $4 }' "$objects" | sort | tail -n 1)
test -n "$latest_key"
base=${latest_key%.dump.age}
encrypted="$work_dir/backup.dump.age"
dump="$work_dir/backup.dump"
manifest="$work_dir/backup.manifest"

s3 s3 cp "s3://${S3_BUCKET}/${latest_key}" "$encrypted" --only-show-errors
s3 s3 cp "s3://${S3_BUCKET}/${base}.manifest" "$manifest" --only-show-errors
expected_sha=$(sed -n 's/^encrypted_sha256=//p' "$manifest")
test -n "$expected_sha"
test "$(sha256sum "$encrypted" | awk '{print $1}')" = "$expected_sha"
age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$dump" "$encrypted"

createdb "$scratch"
PGDATABASE="$scratch" pg_restore --exit-on-error --no-owner --no-acl --dbname="$scratch" "$dump"

expected_migrations=$(sed -n 's/^migration_count=//p' "$manifest")
actual_migrations=$(PGDATABASE="$scratch" psql -X -A -t -q -c 'SELECT count(*) FROM schema_migrations')
test "$actual_migrations" = "$expected_migrations"
expected_fingerprint=$(sed -n 's/^migration_sha256=//p' "$manifest")
actual_fingerprint=$(PGDATABASE="$scratch" migration_fingerprint)
test "$actual_fingerprint" = "$expected_fingerprint"

sed -n 's/^row_count\.//p' "$manifest" | while IFS='=' read -r table expected; do
  case "$table" in
    ''|*[!a-zA-Z0-9_]*) echo "Unsafe table name in manifest: $table" >&2; exit 1 ;;
  esac
  actual=$(PGDATABASE="$scratch" psql -X -A -t -q -c "SELECT count(*) FROM public.\"$table\"")
  test "$actual" = "$expected"
done

touch "$state_dir/last-restore-success"
printf 'restore_check_ok source=%s\n' "$latest_key"
