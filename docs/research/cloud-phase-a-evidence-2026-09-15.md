# BlogFactory Cloud Phase A evidence — 2026-09-15

Status: **production cutover completed**. After the isolated checks, the user
explicitly replaced the synthetic Phase A gate with an immediate migration of
the existing production data. `app.blogfactory.io` now serves the Hetzner stack
through Cloudflare; Vercel remains a ready DNS rollback target.

## Pinned inputs

- Private Cloud commit: `c3b7884743bc42d2eb98bbcc748630ff4e442834`
- Public core fix commit: `8f314cd`
- API image: `ghcr.io/blogfactoryhq/blogfactory-cloud-api@sha256:4a4e2a80934184b0ce3358851d36e6d223543ba0b198909e1b5e6cd3f9efdb98`
- Web image: `ghcr.io/blogfactoryhq/blogfactory-cloud-web@sha256:4f469d63ee1e6161b3a63abe8b67009c4998cf51472b2d207aa929ee81fdaf3d`
- Hetzner location: Nuremberg
- Neon project: separate BlogFactory organization, `aws-eu-central-1`
- R2 bucket: `blogfactory-cloud-phase-a-20260831`, EU jurisdiction, private

## Isolation and health

- Shadow web binds to `127.0.0.1:18080`; the public VM address cannot connect
  to port 18080.
- The pre-existing Caddy site and port 8080 service were preserved. BlogFactory
  uses a separate Caddy include and loopback port 18080.
- API `/api/health`: 200
- API `/api/ready`: 200
- Unauthenticated `/mcp`: 401
- API, worker, and web Docker health: healthy
- Container OOM state: false
- No persistent GHCR credential remains on the VM after digest pulls.

## Database and storage

- 38 additive migrations applied through the direct owner endpoint.
- Runtime traffic uses the pooled endpoint and the login role
  `blogfactory_runtime`.
- Runtime role is not superuser and has no create-role, create-database, or
  replication attributes.
- Initial database size: 9,994,240 bytes (9,760 kB).
- Initial public table count: 31; observed open connections: 4.
- R2 head/write/read/delete round-trip passed; the disposable check object was
  deleted.

## Production cutover

- Final source and target row counts matched after writes were briefly frozen:
  15 users, 6 sites, 764 posts, 1,396 revisions, 1,803 jobs, 2,448 image
  assets, 2,201 image generation requests, and 38 migrations.
- The live database is `blogfactory_prod_live`. Migration traffic uses the
  direct owner endpoint; API and worker traffic use the pooled
  `blogfactory_runtime` role. That role has table DML but no elevated role or
  database-creation privileges.
- 2,372 production R2 objects totaling 454,581,351 bytes were copied to the EU
  bucket. Source and destination counts/bytes matched, and five object SHA-256
  comparisons passed.
- The final 14,482,928-byte encrypted PostgreSQL backup was read back from the
  EU bucket after upload.
- Public checks passed at `https://app.blogfactory.io`: homepage 200, health
  200, readiness 200, OAuth resource metadata 200, and unauthenticated MCP 401
  with a Bearer challenge.
- An authenticated public MCP smoke test passed the exact 22-tool catalog and
  a one-site token returned only that site.
- API, worker, and web run by immutable digest, stayed healthy with zero
  restarts/OOMs, and used approximately 87 MiB, 62 MiB, and 3 MiB respectively
  in the post-cutover sample.
- Cloudflare record `app.blogfactory.io` is proxied to the Hetzner IPv4 origin.
  Clean Vercel deployment `dpl_8K4ES5T71onaYLbN8kNXE73AahNp` was promoted as
  the rollback deployment before the temporary cutover code was removed.

## Fixed-count latency

| Source | Requests | Concurrency | Result | p50 | p95 | Max |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Nuremberg VM | 2,000 | 10 | 2,000 HTTP 200 | 4.0 ms | 6.7 ms | 11.7 ms |
| Istanbul over SSH tunnel | 2,000 | 10 | 2,000 HTTP 200 | 53.7 ms | 84.8 ms | 190.9 ms |

The measured p95 values pass the Phase A `<500 ms` latency gate for the health
replay. Authenticated MCP was verified during cutover; this table remains a
health-only latency sample.

## Recovery checks completed

- API container restart returned ready on the second one-second poll.
- Forced worker termination followed by start returned healthy on the sixth
  one-second poll.
- API and worker remained free of OOM termination.

## Explicitly deferred

- Rotate the R2 credential disclosed during interactive setup and install the
  replacement without placing it in chat or git. The current credential is
  restricted to the migrated EU bucket.
- Better Stack was not configured because no account connection was available.
- Neon Launch/PITR and synthetic replay were not run after the user explicitly
  requested an immediate real-production cutover. Portable encrypted restore,
  the pre-cutover Neon snapshot, live row-count verification, and Vercel/DNS
  rollback remain available.
