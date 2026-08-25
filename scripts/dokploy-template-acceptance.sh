#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template_dir="${DOKPLOY_TEMPLATE_DIR:-$repo_dir/deploy/dokploy/blueprints/blogfactory}"
dokploy_url="${DOKPLOY_URL:-http://127.0.0.1:3000}"
key_file="${DOKPLOY_API_KEY_FILE:?Set DOKPLOY_API_KEY_FILE}"
api_key="$(<"$key_file")"
app_name="blogfactory-acceptance-${GITHUB_RUN_ID:-local}"
compose_id=""

echo "::add-mask::$api_key"

api_post() {
  curl --fail-with-body --silent --show-error \
    -H "x-api-key: $api_key" \
    -H "content-type: application/json" \
    --data "$2" \
    "$dokploy_url/api/$1"
}

api_get() {
  curl --fail-with-body --silent --show-error \
    -H "x-api-key: $api_key" \
    --get --data-urlencode "$2" \
    "$dokploy_url/api/$1"
}

cleanup() {
  if [[ -n "$compose_id" ]]; then
    api_post compose.delete "$(jq -nc --arg id "$compose_id" '{composeId:$id,deleteVolumes:true}')" >/dev/null 2>&1 || true
  fi
}

diagnostics() {
  echo "Dokploy acceptance diagnostics" >&2
  docker ps -a --filter "label=com.docker.compose.project=$app_name" >&2 || true
  for service in postgres minio api web scheduler; do
    container_id="$(docker ps -aq \
      --filter "label=com.docker.compose.project=$app_name" \
      --filter "label=com.docker.compose.service=$service" | head -n 1)"
    if [[ -n "$container_id" ]]; then
      echo "--- $service logs ---" >&2
      docker logs --tail 100 "$container_id" >&2 || true
    fi
  done
}

finish() {
  status=$?
  trap - EXIT
  if [[ "$status" != "0" ]]; then diagnostics; fi
  cleanup
  exit "$status"
}
trap finish EXIT

wait_for_deployment() {
  local previous_id="$1"
  local deployments deployment_id status

  for _ in {1..180}; do
    deployments="$(api_get deployment.allByCompose "composeId=$compose_id")"
    deployment_id="$(jq -r '.[0].deploymentId // empty' <<<"$deployments")"
    status="$(jq -r '.[0].status // empty' <<<"$deployments")"

    if [[ -n "$deployment_id" && "$deployment_id" != "$previous_id" ]]; then
      if [[ "$status" == "done" ]]; then
        printf '%s' "$deployment_id"
        return 0
      fi
      if [[ "$status" == "error" || "$status" == "cancelled" ]]; then
        echo "Dokploy deployment ended with status: $status" >&2
        api_get deployment.readLogs "deploymentId=$deployment_id" >&2 || true
        return 1
      fi
    fi
    sleep 5
  done

  echo "Timed out waiting for Dokploy deployment" >&2
  return 1
}

container_for() {
  docker ps -q \
    --filter "label=com.docker.compose.project=$app_name" \
    --filter "label=com.docker.compose.service=$1" | head -n 1
}

project="$(api_post project.create '{"name":"BlogFactory Acceptance"}')"
environment_id="$(jq -er '.environment.environmentId' <<<"$project")"
echo "Dokploy project created"

compose="$(api_post compose.create "$(jq -nc \
  --arg environmentId "$environment_id" \
  --arg appName "$app_name" \
  '{name:"BlogFactory",environmentId:$environmentId,composeType:"docker-compose",appName:$appName,sourceType:"raw"}')")"
compose_id="$(jq -er '.composeId' <<<"$compose")"
echo "Dokploy Compose service created"

payload="$(jq -nc \
  --rawfile compose "$template_dir/docker-compose.yml" \
  --rawfile config "$template_dir/template.toml" \
  '{compose:$compose,config:$config}' | base64 -w 0)"
api_post compose.import "$(jq -nc --arg id "$compose_id" --arg base64 "$payload" '{composeId:$id,base64:$base64}')" >/dev/null

api_post compose.deploy "$(jq -nc --arg id "$compose_id" '{composeId:$id,title:"BlogFactory Dokploy acceptance"}')" >/dev/null
deployment_id="$(wait_for_deployment "")"
echo "Dokploy deployment completed"

compose_state="$(api_get compose.one "composeId=$compose_id")"
test "$(jq -r '.composeStatus' <<<"$compose_state")" = "done"
host="$(jq -er '.domains[] | select(.serviceName == "web") | .host' <<<"$compose_state")"
env_text="$(jq -er '.env' <<<"$compose_state")"
admin_email="$(sed -n 's/^ADMIN_EMAILS=//p' <<<"$env_text")"
test -n "$admin_email"
printf '127.0.0.1 %s\n' "$host" | sudo tee -a /etc/hosts >/dev/null

app_curl() {
  curl --noproxy '*' -H "Host: $host" "$@"
}

for _ in {1..60}; do
  app_curl --fail --silent "http://127.0.0.1/api/ready" >/dev/null && break
  sleep 5
done
app_curl --fail --silent "http://127.0.0.1/api/ready" | jq -e '.status == "ready"' >/dev/null
app_curl --fail --silent "http://127.0.0.1/" | grep -q '<title>BlogFactory</title>'
echo "BlogFactory public route is ready"

tmp_dir="$(mktemp -d)"
status="$(app_curl --silent --output "$tmp_dir/mcp-response" --dump-header "$tmp_dir/mcp-headers" --write-out '%{http_code}' "http://127.0.0.1/mcp")"
test "$status" = "401"
grep -qi '^www-authenticate: Bearer' "$tmp_dir/mcp-headers"

app_curl --fail --silent -H 'content-type: application/json' \
  --data "$(jq -nc --arg email "$admin_email" '{email:$email,password:"dokploy-acceptance-password",displayName:"Admin",consent:true}')" \
  "http://127.0.0.1/api/auth/signup" > "$tmp_dir/signup.json"
auth_token="$(jq -er .token "$tmp_dir/signup.json")"

app_curl --fail --silent -H "authorization: Bearer $auth_token" -H 'content-type: application/json' \
  --data '{"url":"https://example.com","name":"Dokploy Acceptance Site"}' \
  "http://127.0.0.1/api/sites" > "$tmp_dir/site.json"
site_id="$(jq -er .site.id "$tmp_dir/site.json")"

printf 'blogfactory-dokploy-storage-acceptance' > "$tmp_dir/object.txt"
app_curl --fail --silent -H "authorization: Bearer $auth_token" \
  -F "file=@$tmp_dir/object.txt;type=text/plain" \
  "http://127.0.0.1/api/images/upload" > "$tmp_dir/upload.json"
storage_path="$(jq -er '.storagePath // .storage_path' "$tmp_dir/upload.json")"
app_curl --fail --silent "http://127.0.0.1/api/storage/$storage_path" | cmp - "$tmp_dir/object.txt"

app_curl --fail --silent -H "authorization: Bearer $auth_token" -H 'content-type: application/json' \
  --data "$(jq -nc --arg site "$site_id" '{name:"Dokploy Acceptance MCP",scopes:["content:read","drafts:write","publish:draft"],site_ids:[$site]}')" \
  "http://127.0.0.1/api/mcp/tokens" > "$tmp_dir/mcp-token.json"
MCP_SMOKE_TOKEN="$(jq -er .secret "$tmp_dir/mcp-token.json")" \
MCP_SMOKE_URL="http://$host/mcp" \
  bun run "$repo_dir/server/src/run-self-host-mcp-smoke.ts"

for service in postgres minio api web scheduler; do
  container_id="$(container_for "$service")"
  test -n "$container_id"
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  if [[ "$service" == "scheduler" ]]; then
    test "$state" = "running"
  else
    test "$state" = "healthy"
  fi
done

scheduler_id="$(container_for scheduler)"
for _ in {1..30}; do
  docker logs "$scheduler_id" 2>&1 | grep -q 'Scheduler drain completed' && break
  sleep 2
done
docker logs "$scheduler_id" 2>&1 | grep -q 'Scheduler drain completed'

docker restart "$(container_for postgres)" "$(container_for minio)" "$(container_for api)" >/dev/null
for _ in {1..120}; do
  app_curl --fail --silent "http://127.0.0.1/api/ready" >/dev/null && break
  sleep 5
done
app_curl --fail --silent -H 'content-type: application/json' \
  --data "$(jq -nc --arg email "$admin_email" '{email:$email,password:"dokploy-acceptance-password"}')" \
  "http://127.0.0.1/api/auth/login" > "$tmp_dir/login.json"
auth_token="$(jq -er .token "$tmp_dir/login.json")"
app_curl --fail --silent -H "authorization: Bearer $auth_token" "http://127.0.0.1/api/sites" \
  | jq -e --arg id "$site_id" '.sites | any(.id == $id)' >/dev/null
app_curl --fail --silent "http://127.0.0.1/api/storage/$storage_path" | cmp - "$tmp_dir/object.txt"

closed_env="$(sed 's/^BLOGFACTORY_ALLOW_SIGNUP=.*/BLOGFACTORY_ALLOW_SIGNUP=false/' <<<"$env_text")"
api_post compose.saveEnvironment "$(jq -nc --arg id "$compose_id" --arg env "$closed_env" '{composeId:$id,env:$env,createEnvFile:false}')" >/dev/null
api_post compose.deploy "$(jq -nc --arg id "$compose_id" '{composeId:$id,title:"Disable public signup"}')" >/dev/null
wait_for_deployment "$deployment_id" >/dev/null

for _ in {1..120}; do
  app_curl --fail --silent "http://127.0.0.1/api/ready" >/dev/null && break
  sleep 5
done
status="$(app_curl --silent --output /dev/null --write-out '%{http_code}' -H 'content-type: application/json' \
  --data '{"email":"blocked@example.com","password":"dokploy-acceptance-password","consent":true}' \
  "http://127.0.0.1/api/auth/signup")"
test "$status" = "403"

echo "Dokploy template acceptance passed"
