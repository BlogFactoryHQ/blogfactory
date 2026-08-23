# Railway deployment contract

The public template maps the canonical Compose stack to five Railway services so it fits Railway Hobby's service ceiling:

| Service | Source | Public | Required configuration |
| --- | --- | --- | --- |
| `web` | `ghcr.io/boragkc/blogfactory-web:v0.1.0` | yes | `PORT=80`; `API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3000` |
| `api` | `ghcr.io/boragkc/blogfactory-api:v0.1.0` | no | pre-deploy `bun run src/init-s3-bucket.ts`; variables below; health path `/api/ready` |
| `Postgres` | Railway managed PostgreSQL | no | managed service defaults |
| `minio` | `minio/minio:latest` | no | command `/usr/bin/minio server /data --address :9000 --console-address :9001`; volume mounted at `/data` |
| `cron` | `ghcr.io/boragkc/blogfactory-api:v0.1.0` | no | command `bun run src/run-cron-once.ts`; cron `0 */6 * * *`; restart `NEVER` |

The template asks only for `ADMIN_EMAILS`. It generates independent values for `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, `CRON_SECRET`, and `MINIO_ROOT_PASSWORD` with Railway template variable functions. Do not publish a template with literal defaults.

API variables:

```dotenv
NODE_ENV=production
PORT=3000
BLOGFACTORY_SELF_HOSTED=true
BLOGFACTORY_ALLOW_SIGNUP=true
ADMIN_EMAILS=${{ADMIN_EMAILS}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=${{secret(48)}}
API_KEY_ENCRYPTION_SECRET=${{secret(48)}}
CRON_SECRET=${{secret(48)}}
WEB_APP_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
MCP_APP_URL=http://${{web.RAILWAY_PRIVATE_DOMAIN}}:80/mcp-review.html
MCP_ALLOWED_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
S3_ENDPOINT=http://${{minio.RAILWAY_PRIVATE_DOMAIN}}:9000
S3_ACCESS_KEY_ID=blogfactory
S3_SECRET_ACCESS_KEY=${{minio.MINIO_ROOT_PASSWORD}}
S3_BUCKET=blogfactory
S3_REGION=us-east-1
```

MinIO uses `MINIO_ROOT_USER=blogfactory`, a generated `MINIO_ROOT_PASSWORD`, and port `9000`. Mount a 500 MB persistent volume at `/data` on Railway Hobby. Before each API deployment, Railway runs the following idempotent pre-deploy command with the API's `S3_*` variables:

```sh
bun run src/init-s3-bucket.ts
```

Set `CRON_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3000/api/cron/drain` and give `cron` the same generated `CRON_SECRET` as the API. The cron command exits after one bounded drain:

```sh
bun run src/run-cron-once.ts
```

For repository-backed acceptance builds, set the API root directory to `server` with Dockerfile path `server/Dockerfile`, and the web root directory to `web` with Dockerfile path `web/Dockerfile`. Railway resolves Dockerfile and config-file paths from the repository root even when the build context is narrowed: `/deploy/railway/api.railway.json` and `/deploy/railway/web.railway.json`. Released templates use the pinned GHCR images above and do not need repository access.

The `*.railway.json` files contain the checked-in service health, Dockerfile, restart, and cron contracts. Assign the matching file as each repository-backed service's config-as-code path. Publish the template badge only after a real project passes the same smoke and persistence checks as Docker Compose.
