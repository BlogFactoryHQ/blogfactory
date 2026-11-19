#!/bin/sh

require_backup_env() {
  : "${PGHOST:?}"
  : "${PGDATABASE:?}"
  : "${PGUSER:?}"
  : "${PGPASSWORD:?}"
  : "${S3_ENDPOINT:?}"
  : "${S3_ACCESS_KEY_ID:?}"
  : "${S3_SECRET_ACCESS_KEY:?}"
  : "${S3_BUCKET:?}"
  : "${BACKUP_R2_PREFIX:?}"
  export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="${S3_REGION:-auto}"
}

s3() {
  aws --endpoint-url "$S3_ENDPOINT" "$@"
}

migration_fingerprint() {
  psql -X -A -t -q -c "SELECT filename || E'\\t' || checksum FROM schema_migrations ORDER BY filename" | sha256sum | awk '{print $1}'
}

table_counts() {
  psql -X -A -t -q -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename" |
  while IFS= read -r table; do
    case "$table" in
      ''|*[!a-zA-Z0-9_]*) echo "Unsafe table name: $table" >&2; return 1 ;;
    esac
    count=$(psql -X -A -t -q -c "SELECT count(*) FROM public.\"$table\"")
    printf 'row_count.%s=%s\n' "$table" "$count"
  done
}

retention_candidates() {
  keep="$1"
  awk -v keep="$keep" '{ keys[NR]=$0 } END { for (i=1; i<=NR-keep; i++) print keys[i] }'
}

promotion_periods() {
  timestamp="$1"
  date_part=${timestamp%%T*}
  if week=$(date -u -d "$date_part" +%G-W%V 2>/dev/null); then
    :
  else
    week=$(date -u -j -f %Y-%m-%d "$date_part" +%G-W%V)
  fi
  printf 'daily:%s\nweekly:%s\nmonthly:%s\n' "$date_part" "$week" "${date_part%-*}"
}
