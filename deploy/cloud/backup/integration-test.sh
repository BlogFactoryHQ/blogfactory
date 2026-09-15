#!/bin/sh
set -eu

suffix="$$"
network="blogfactory-backup-test-${suffix}"
postgres_container="blogfactory-backup-postgres-${suffix}"
minio_container="blogfactory-backup-minio-${suffix}"
state_volume="blogfactory-backup-state-${suffix}"
backup_image="blogfactory-cloud-backup:test-${suffix}"
test_dir=$(mktemp -d)

cleanup() {
  docker rm -f "$postgres_container" "$minio_container" >/dev/null 2>&1 || true
  docker volume rm "$state_volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$backup_image" >/dev/null 2>&1 || true
  rm -rf -- "$test_dir"
}
trap cleanup EXIT HUP INT TERM

docker network create "$network" >/dev/null
docker volume create "$state_volume" >/dev/null
docker build -t "$backup_image" "$(dirname "$0")" >/dev/null

docker run -d --name "$postgres_container" --network "$network" --network-alias postgres \
  -e POSTGRES_DB=blogfactory_prod_live \
  -e POSTGRES_USER=blogfactory_owner \
  -e POSTGRES_PASSWORD=ownerpass \
  postgres:18-alpine >/dev/null

attempt=0
until docker exec "$postgres_container" pg_isready -U blogfactory_owner -d blogfactory_prod_live >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30
  sleep 1
done

docker cp "$(dirname "$0")/../postgres/init-runtime-role.sh" "$postgres_container:/tmp/init-runtime-role.sh"
docker exec \
  -e PGHOST=127.0.0.1 \
  -e PGDATABASE=blogfactory_prod_live \
  -e PGUSER=blogfactory_owner \
  -e PGPASSWORD=ownerpass \
  -e POSTGRES_DB=blogfactory_prod_live \
  -e POSTGRES_OWNER_USER=blogfactory_owner \
  -e POSTGRES_RUNTIME_USER=blogfactory_runtime \
  -e POSTGRES_RUNTIME_PASSWORD=runtimepass \
  "$postgres_container" /tmp/init-runtime-role.sh
docker exec \
  -e PGHOST=127.0.0.1 \
  -e PGDATABASE=blogfactory_prod_live \
  -e PGUSER=blogfactory_owner \
  -e PGPASSWORD=ownerpass \
  -e POSTGRES_DB=blogfactory_prod_live \
  -e POSTGRES_OWNER_USER=blogfactory_owner \
  -e POSTGRES_RUNTIME_USER=blogfactory_runtime \
  -e POSTGRES_RUNTIME_PASSWORD=runtimepass \
  "$postgres_container" /tmp/init-runtime-role.sh

docker exec "$postgres_container" psql -U blogfactory_owner -d blogfactory_prod_live -v ON_ERROR_STOP=1 -c \
  "CREATE EXTENSION pgcrypto; CREATE TABLE schema_migrations(filename text PRIMARY KEY, checksum text NOT NULL); INSERT INTO schema_migrations VALUES ('0001_test.sql','abc'); CREATE TABLE posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL); INSERT INTO posts(title) VALUES ('one'),('two');" >/dev/null
docker exec -e PGPASSWORD=runtimepass "$postgres_container" \
  psql -h 127.0.0.1 -U blogfactory_runtime -d blogfactory_prod_live -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM posts" >/dev/null
if docker exec -e PGPASSWORD=runtimepass "$postgres_container" \
  psql -h 127.0.0.1 -U blogfactory_runtime -d blogfactory_prod_live \
  -c "CREATE TABLE runtime_must_not_create(id integer)" >/dev/null 2>&1; then
  echo "runtime role unexpectedly created a table" >&2
  exit 1
fi

docker run -d --name "$minio_container" --network "$network" --network-alias minio \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin123 \
  quay.io/minio/minio:latest server /data >/dev/null

attempt=0
until docker run --rm --network "$network" \
  -e MC_HOST_local=http://minioadmin:minioadmin123@minio:9000 \
  quay.io/minio/mc:latest ready local >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30
  sleep 1
done
docker run --rm --network "$network" \
  -e MC_HOST_local=http://minioadmin:minioadmin123@minio:9000 \
  quay.io/minio/mc:latest mb local/blogfactory-backups >/dev/null

docker run --rm --entrypoint age-keygen -v "$test_dir:/keys" "$backup_image" -o /keys/age.key >/dev/null
recipient=$(docker run --rm --entrypoint age-keygen -v "$test_dir:/keys:ro" "$backup_image" -y /keys/age.key)
chmod 600 "$test_dir/age.key"

common_env="-e PGHOST=postgres -e PGDATABASE=blogfactory_prod_live -e PGUSER=blogfactory_owner -e PGPASSWORD=ownerpass -e S3_ENDPOINT=http://minio:9000 -e S3_ACCESS_KEY_ID=minioadmin -e S3_SECRET_ACCESS_KEY=minioadmin123 -e S3_BUCKET=blogfactory-backups -e S3_REGION=us-east-1 -e BACKUP_R2_PREFIX=database-backups"

# shellcheck disable=SC2086
docker run --rm --network "$network" --entrypoint /usr/local/bin/backup.sh \
  $common_env -e BACKUP_AGE_RECIPIENT="$recipient" \
  -v "$state_volume:/var/lib/blogfactory-backup" "$backup_image"

# shellcheck disable=SC2086
docker run --rm --network "$network" --entrypoint /usr/local/bin/restore-check.sh \
  $common_env -e BACKUP_AGE_IDENTITY_FILE=/run/secrets/backup_age_identity \
  -v "$test_dir/age.key:/run/secrets/backup_age_identity:ro" \
  -v "$state_volume:/var/lib/blogfactory-backup" "$backup_image"

printf 'backup_restore_integration_ok\n'
