# Railway deployment contract

The public template must map the canonical Compose stack to six Railway services:

| Service | Source | Public | Required configuration |
| --- | --- | --- | --- |
| `web` | `ghcr.io/boragkc/blogfactory-web:v0.1.0` | yes | `API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |
| `api` | `ghcr.io/boragkc/blogfactory-api:v0.1.0` | no | variables below; health path `/api/ready` |
| `Postgres` | Railway managed PostgreSQL | no | managed service defaults |
| `minio` | `minio/minio:latest` | no | command `server /data`; volume mounted at `/data` |
| `bucket-init` | `minio/mc:latest` | no | one-shot bucket creation; restart `NEVER` |
| `cron` | `curlimages/curl:latest` | no | protected one-shot drain; cron `0 */6 * * *`; restart `NEVER` |

The template asks only for `ADMIN_EMAILS`. It generates independent values for `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, `CRON_SECRET`, and `MINIO_ROOT_PASSWORD` with Railway template variable functions. Do not publish a template with literal defaults.

API variables:

```dotenv
NODE_ENV=production
BLOGFACTORY_SELF_HOSTED=true
BLOGFACTORY_ALLOW_SIGNUP=true
ADMIN_EMAILS=${{ADMIN_EMAILS}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=${{secret(48)}}
API_KEY_ENCRYPTION_SECRET=${{secret(48)}}
CRON_SECRET=${{secret(48)}}
WEB_APP_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
MCP_APP_URL=http://${{web.RAILWAY_PRIVATE_DOMAIN}}:${{web.PORT}}/mcp-review.html
MCP_ALLOWED_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
S3_ENDPOINT=http://${{minio.RAILWAY_PRIVATE_DOMAIN}}:9000
S3_ACCESS_KEY_ID=blogfactory
S3_SECRET_ACCESS_KEY=${{minio.MINIO_ROOT_PASSWORD}}
S3_BUCKET=blogfactory
S3_REGION=us-east-1
```

MinIO uses `MINIO_ROOT_USER=blogfactory`, a generated `MINIO_ROOT_PASSWORD`, and port `9000`. `bucket-init` runs:

```sh
mc alias set local http://${{minio.RAILWAY_PRIVATE_DOMAIN}}:9000 blogfactory "$MINIO_ROOT_PASSWORD" && mc mb --ignore-existing local/blogfactory
```

The cron command exits after one bounded drain:

```sh
curl --fail --silent --show-error -H "Authorization: Bearer $CRON_SECRET" "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}/api/cron/drain"
```

The `*.railway.json` files contain the checked-in service health, Dockerfile, restart, and cron contracts. Assign the matching file as each repository-backed service's config-as-code path. Publish the template badge only after a real project passes the same smoke and persistence checks as Docker Compose.
