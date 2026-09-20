# BlogFactory Cloud deployment

This private repository owns the `app.blogfactory.io` Hetzner deployment. The
public [`BlogFactoryHQ/blogfactory`](https://github.com/BlogFactoryHQ/blogfactory)
repository remains the canonical open-source core.

- Shared changes merge here through the fail-closed upstream sync workflow.
- Cloud-only deployment, billing, entitlement, and backup work stays private.
- CI validates the merged core and publishes API, web, and backup images to
  GHCR with commit-SHA tags and immutable digests.
- Deployment is an explicit SSH/Compose operation. GitHub does not hold a
  production SSH key and does not auto-deploy the host.

## Verified production topology — 2026-09-20

Production is not using the repository's local-PostgreSQL Compose design.
The active host project is `/home/deploy/blogfactory-cloud-shadow` and runs
only `migrate`, `api`, `worker`, and `web`:

```text
Cloudflare -> Caddy -> web/Nginx -> API -> Neon PostgreSQL 18 (Frankfurt)
                                      +-> Cloudflare R2 (EU)
                         worker ------+
```

- API and worker use the pooled Neon endpoint for `blogfactory_prod_live`.
- Migrations use the direct Neon endpoint.
- No PostgreSQL container, database volume, backup container, or scheduler is
  active on the host.
- The repository's `deploy/cloud/compose.yaml` is a tested rehearsal/future
  cutover design, not the production manifest.
- The production manifest is the host-only `compose.cloud.yaml`; never replace
  it with the repository Compose file during a routine application release.

The six-hour encrypted backup design is also not deployed. On 2026-09-20 the
R2 `database-backups/` prefix was empty and the host had no success or restore
markers. A one-off read-only Neon dump restored successfully into disposable
PostgreSQL 18, with all 42 migrations and all 42 public-table row counts
matching, but that drill is not a durable backup. Until the scheduled encrypted
pipeline is installed and verified, the claimed six-hour RPO and four-hour RTO
do not apply.

The exact release, verification, backup gap, and rollback procedure lives in
[`deploy/cloud/README.md`](deploy/cloud/README.md). Runtime credentials belong
only in the host secret file and offline escrow, never in Git, workflow
summaries, image layers, or logs.
