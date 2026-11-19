#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="blogfactory-smoke-${GITHUB_RUN_ID:-local}"
port="${BLOGFACTORY_SMOKE_PORT:-18080}"
tmp_dir="$(mktemp -d)"
env_file="$tmp_dir/self-host.env"
base_url="http://localhost:$port"

cleanup() {
  docker compose --env-file "$env_file" -p "$project" -f "$repo_dir/compose.yaml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

cp "$repo_dir/.env.self-host.example" "$env_file"
sed -i.bak \
  -e "s/^BLOGFACTORY_PORT=.*/BLOGFACTORY_PORT=$port/" \
  -e "s|^BLOGFACTORY_URL=.*|BLOGFACTORY_URL=$base_url|" \
  -e "s/^ADMIN_EMAILS=.*/ADMIN_EMAILS=admin@example.com/" \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=postgres-smoke-0123456789abcdef0123456789abcdef/" \
  -e "s/^MINIO_ROOT_PASSWORD=.*/MINIO_ROOT_PASSWORD=minio-smoke-0123456789abcdef0123456789abcdef/" \
  -e "s/^JWT_SECRET=.*/JWT_SECRET=jwt-smoke-0123456789abcdef0123456789abcdef/" \
  -e "s/^API_KEY_ENCRYPTION_SECRET=.*/API_KEY_ENCRYPTION_SECRET=encryption-smoke-0123456789abcdef0123456789abcdef/" \
  -e "s/^CRON_SECRET=.*/CRON_SECRET=cron-smoke-0123456789abcdef0123456789abcdef/" \
  "$env_file"

compose=(docker compose --env-file "$env_file" -p "$project" -f "$repo_dir/compose.yaml")
"${compose[@]}" build --pull
"${compose[@]}" up -d

for _ in {1..90}; do
  curl --fail --silent "$base_url/api/ready" >/dev/null && break
  sleep 2
done
curl --fail --silent "$base_url/api/ready" | grep -q '"status":"ready"'
curl --fail --silent "$base_url/" | grep -q '<title>BlogFactory</title>'
for _ in {1..30}; do
  "${compose[@]}" logs scheduler 2>&1 | grep -q "Scheduler drain completed" && break
  sleep 2
done
"${compose[@]}" logs scheduler 2>&1 | grep -q "Scheduler drain completed"

status="$(curl --silent --output "$tmp_dir/mcp-response" --dump-header "$tmp_dir/mcp-headers" --write-out '%{http_code}' "$base_url/mcp")"
test "$status" = "401"
grep -qi '^www-authenticate: Bearer' "$tmp_dir/mcp-headers"

curl --fail --silent -H 'content-type: application/json' \
  --data '{"email":"admin@example.com","password":"self-host-smoke-password","displayName":"Admin","consent":true}' \
  "$base_url/api/auth/signup" > "$tmp_dir/signup.json"
auth_token="$(jq -er .token "$tmp_dir/signup.json")"

curl --fail --silent -H "authorization: Bearer $auth_token" -H 'content-type: application/json' \
  --data '{"url":"https://example.com","name":"Smoke Site"}' \
  "$base_url/api/sites" > "$tmp_dir/site.json"
site_id="$(jq -er .site.id "$tmp_dir/site.json")"

printf 'blogfactory-storage-smoke' > "$tmp_dir/smoke.txt"
curl --fail --silent -H "authorization: Bearer $auth_token" -F "file=@$tmp_dir/smoke.txt;type=text/plain" \
  "$base_url/api/images/upload" > "$tmp_dir/upload.json"
storage_path="$(jq -er '.storagePath // .storage_path' "$tmp_dir/upload.json")"
curl --fail --silent "$base_url/api/storage/$storage_path" | cmp - "$tmp_dir/smoke.txt"

curl --fail --silent -H "authorization: Bearer $auth_token" -H 'content-type: application/json' \
  --data "{\"name\":\"Smoke MCP\",\"scopes\":[\"content:read\",\"drafts:write\",\"publish:draft\"],\"site_ids\":[\"$site_id\"]}" \
  "$base_url/api/mcp/tokens" > "$tmp_dir/mcp-token.json"
MCP_SMOKE_TOKEN="$(jq -er .secret "$tmp_dir/mcp-token.json")" MCP_SMOKE_URL="$base_url/mcp" \
  bun run "$repo_dir/server/src/run-self-host-mcp-smoke.ts"

"${compose[@]}" up -d --no-deps --force-recreate api
for _ in {1..60}; do
  curl --fail --silent "$base_url/api/ready" >/dev/null && break
  sleep 2
done
curl --fail --silent -H 'content-type: application/json' \
  --data '{"email":"admin@example.com","password":"self-host-smoke-password"}' \
  "$base_url/api/auth/login" > "$tmp_dir/login.json"
auth_token="$(jq -er .token "$tmp_dir/login.json")"
curl --fail --silent -H "authorization: Bearer $auth_token" "$base_url/api/sites" | jq -e --arg id "$site_id" '.sites | any(.id == $id)' >/dev/null

BLOGFACTORY_ALLOW_SIGNUP=false "${compose[@]}" up -d --no-deps --force-recreate api
for _ in {1..60}; do
  curl --fail --silent "$base_url/api/ready" >/dev/null && break
  sleep 2
done
status="$(curl --silent --output /dev/null --write-out '%{http_code}' -H 'content-type: application/json' \
  --data '{"email":"blocked@example.com","password":"self-host-smoke-password","consent":true}' \
  "$base_url/api/auth/signup")"
test "$status" = "403"

echo "Docker Compose self-host smoke passed"
