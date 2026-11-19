#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat >"$tmp_dir/docker" <<'EOF'
#!/bin/sh
[ "$1" = "pull" ]
printf '%s\n' "$2" >>"${PREFLIGHT_LOG:?}"
EOF
chmod +x "$tmp_dir/docker"

digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
PREFLIGHT_LOG="$tmp_dir/pulls" DOCKER_BIN="$tmp_dir/docker" "$script_dir/preflight-registry.sh" \
  "ghcr.io/example/api@$digest" "ghcr.io/example/web@$digest" >/dev/null
[ "$(wc -l <"$tmp_dir/pulls" | tr -d ' ')" = "2" ]

if DOCKER_BIN="$tmp_dir/docker" "$script_dir/preflight-registry.sh" ghcr.io/example/api:latest "ghcr.io/example/web@$digest" >/dev/null 2>&1; then
  echo "mutable tag was accepted" >&2
  exit 1
fi
if DOCKER_BIN="$tmp_dir/docker" "$script_dir/preflight-registry.sh" "ghcr.io/example/api@sha256:${digest#sha256:}z" "ghcr.io/example/web@$digest" >/dev/null 2>&1; then
  echo "invalid digest was accepted" >&2
  exit 1
fi

echo "registry preflight self-test passed"
