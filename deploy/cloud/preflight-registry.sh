#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <api-image@sha256:digest> <web-image@sha256:digest>" >&2
  exit 2
fi

docker_bin="${DOCKER_BIN:-docker}"
for image in "$@"; do
  case "$image" in
    ghcr.io/*@sha256:*) ;;
    *) echo "image must be an immutable ghcr.io digest: $image" >&2; exit 2 ;;
  esac
  digest="${image##*@sha256:}"
  if [ "${#digest}" -ne 64 ]; then
    echo "image must be an immutable ghcr.io digest: $image" >&2
    exit 2
  fi
  case "$digest" in *[!0-9a-f]*) echo "image must be an immutable ghcr.io digest: $image" >&2; exit 2 ;; esac
  "$docker_bin" pull "$image" >/dev/null
done

echo "GHCR preflight passed for API and web images"
