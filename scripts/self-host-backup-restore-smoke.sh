#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="${GITHUB_RUN_ID:-local}"
source_project="blogfactory-backup-source-$run_id"
target_project="blogfactory-backup-target-$run_id"
port="${BLOGFACTORY_BACKUP_SMOKE_PORT:-18081}"
tmp_dir="$(mktemp -d)"
env_file="$tmp_dir/self-host.env"
base_url="http://localhost:$port"

cleanup() {
  for project in "$source_project" "$target_project"; do
    docker compose --env-file "$env_file" -p "$project" -f "$repo_dir/compose.yaml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  done
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

cp "$repo_dir/.env.self-host.example" "$env_file"
sed -i.bak \
  -e "s/^BLOGFACTORY_PORT=.*/BLOGFACTORY_PORT=$port/" \
  -e "s|^BLOGFACTORY_URL=.*|BLOGFACTORY_URL=$base_url|" \
  -e "s/^ADMIN_EMAILS=.*/ADMIN_EMAILS=admin@example.com/" \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=postgres-backup-0123456789abcdef0123456789abcdef/" \
  -e "s/^MINIO_ROOT_PASSWORD=.*/MINIO_ROOT_PASSWORD=minio-backup-0123456789abcdef0123456789abcdef/" \
  -e "s/^JWT_SECRET=.*/JWT_SECRET=jwt-backup-0123456789abcdef0123456789abcdef/" \
  -e "s/^API_KEY_ENCRYPTION_SECRET=.*/API_KEY_ENCRYPTION_SECRET=encryption-backup-0123456789abcdef0123456789abcdef/" \
  -e "s/^CRON_SECRET=.*/CRON_SECRET=cron-backup-0123456789abcdef0123456789abcdef/" \
  "$env_file"

source_compose=(docker compose --env-file "$env_file" -p "$source_project" -f "$repo_dir/compose.yaml")
target_compose=(docker compose --env-file "$env_file" -p "$target_project" -f "$repo_dir/compose.yaml")
"${source_compose[@]}" up -d --build
for _ in {1..90}; do curl --fail --silent "$base_url/api/ready" >/dev/null && break; sleep 2; done

curl --fail --silent -H 'content-type: application/json' \
  --data '{"email":"admin@example.com","password":"backup-smoke-password","consent":true}' \
  "$base_url/api/auth/signup" > "$tmp_dir/signup.json"
auth_token="$(jq -er .token "$tmp_dir/signup.json")"
printf 'blogfactory-backup-object' > "$tmp_dir/object.txt"
curl --fail --silent -H "authorization: Bearer $auth_token" -F "file=@$tmp_dir/object.txt;type=text/plain" \
  "$base_url/api/images/upload" > "$tmp_dir/upload.json"
storage_path="$(jq -er '.storagePath // .storage_path' "$tmp_dir/upload.json")"

"${source_compose[@]}" stop api scheduler
"${source_compose[@]}" exec -T postgres pg_dump -U blogfactory -d blogfactory -Fc > "$tmp_dir/blogfactory.dump"
mkdir "$tmp_dir/objects"
docker run --rm --user "$(id -u):$(id -g)" --network "${source_project}_default" -e MC_CONFIG_DIR=/tmp/.mc -v "$tmp_dir/objects:/backup" --entrypoint /bin/sh minio/mc:latest -c \
  'mc alias set local http://minio:9000 blogfactory minio-backup-0123456789abcdef0123456789abcdef && mc mirror local/blogfactory /backup'
"${source_compose[@]}" down --volumes --remove-orphans

"${target_compose[@]}" up -d
for _ in {1..90}; do curl --fail --silent "$base_url/api/ready" >/dev/null && break; sleep 2; done
"${target_compose[@]}" stop api scheduler
"${target_compose[@]}" exec -T postgres pg_restore -U blogfactory -d blogfactory --clean --if-exists < "$tmp_dir/blogfactory.dump"
docker run --rm --network "${target_project}_default" -v "$tmp_dir/objects:/backup:ro" --entrypoint /bin/sh minio/mc:latest -c \
  'mc alias set local http://minio:9000 blogfactory minio-backup-0123456789abcdef0123456789abcdef && mc mirror /backup local/blogfactory'
"${target_compose[@]}" start api scheduler
for _ in {1..60}; do curl --fail --silent "$base_url/api/ready" >/dev/null && break; sleep 2; done

curl --fail --silent -H 'content-type: application/json' \
  --data '{"email":"admin@example.com","password":"backup-smoke-password"}' \
  "$base_url/api/auth/login" | jq -e .token >/dev/null
curl --fail --silent "$base_url/api/storage/$storage_path" | cmp - "$tmp_dir/object.txt"

echo "Docker Compose backup and restore smoke passed"
