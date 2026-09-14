# BlogFactory Cloud Phase A evidence — 2026-09-15

Status: **in progress**. This is an isolated shadow deployment; it is not a
production cutover or a Phase B promotion record.

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
- Existing Caddy and port 8080 service were left unchanged.
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

## Fixed-count latency

| Source | Requests | Concurrency | Result | p50 | p95 | Max |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Nuremberg VM | 2,000 | 10 | 2,000 HTTP 200 | 4.0 ms | 6.7 ms | 11.7 ms |
| Istanbul over SSH tunnel | 2,000 | 10 | 2,000 HTTP 200 | 53.7 ms | 84.8 ms | 190.9 ms |

The measured p95 values pass the Phase A `<500 ms` latency gate for the health
replay. Application-shaped authenticated requests remain pending.

## Recovery checks completed

- API container restart returned ready on the second one-second poll.
- Forced worker termination followed by start returned healthy on the sixth
  one-second poll.
- API and worker remained free of OOM termination.

## Pending before Phase A acceptance

- Confirm Hetzner VM backups are enabled.
- Rotate the R2 credential disclosed during interactive setup and install the
  replacement without placing it in chat or git.
- Seed synthetic tenant/site/content/queue data and run authenticated workload
  replay, isolation, claim/retry/stale-recovery, and MCP catalog checks.
- Record Neon compute/transfer and R2 request/storage deltas.
- Run encrypted portable dump, disposable restore, and application/row-count
  verification.
- Run PITR after temporarily enabling the required Neon plan.
- Run the VM reboot check only after confirming the unrelated pre-existing
  service on ports 80/443/8080 may be interrupted.
- Record cumulative pre-tax spend and confirm it remains at or below $35.

Phase B is not authorized by this evidence.
