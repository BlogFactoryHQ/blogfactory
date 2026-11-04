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

Production uses the local-PostgreSQL Compose design. The active host project is
`/home/deploy/blogfactory-cloud-shadow` and runs PostgreSQL, API, worker, web,
and the encrypted backup scheduler:

```text
Cloudflare -> Caddy -> web/Nginx -> API -> PostgreSQL 18 (Hetzner volume)
                                      +-> Cloudflare R2 (EU)
                         worker ------+          ^
                         backup -----------------+
```

- API and worker use the least-privilege `blogfactory_runtime` role on the
  private Compose network.
- Migrations, role initialization, and backups use the local owner role.
- PostgreSQL data and backup state live in named Docker volumes; database port
  5432 is not published on the host.
- The repository's `deploy/cloud/compose.yaml` remains the reference design;
  production uses the host-only `compose.cloud.yaml` variant.
- The production manifest is the host-only `compose.cloud.yaml`; never replace
  it with the repository Compose file during a routine application release.

The database cutover completed on 2026-09-20 from a writer-frozen Neon dump.
All 42 migrations and all 42 public-table row counts matched after restore. The
six-hour scheduler now uploads age-encrypted dumps and manifests to the private
R2 `database-backups/` prefix. Full SHA-256 readback and a disposable restore
from R2 both passed before traffic moved; a second encrypted backup passed from
the final local database. Neon and snapshot `snap-royal-field-b1qihbq0` remain
available as the short-term cutover rollback source and must not be deleted as
part of a routine release.

The exact release, verification, backup operation, and rollback procedure lives in
[`deploy/cloud/README.md`](deploy/cloud/README.md). Runtime credentials belong
only in the host secret file and offline escrow, never in Git, workflow
summaries, image layers, or logs.
