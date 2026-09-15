# BlogFactory Cloud deployment

This private repository owns the `app.blogfactory.io` Hetzner deployment. The
public [`BlogFactoryHQ/blogfactory`](https://github.com/BlogFactoryHQ/blogfactory)
repository remains the canonical open-source core.

- Shared changes merge here through the fail-closed upstream sync workflow.
- Cloud-only Compose, backup, deployment, billing, and entitlement code stays
  private and never syncs back automatically.
- CI validates the merged core and publishes API, web, and backup images to
  GHCR with commit-SHA tags and immutable digests.
- Deployment to Hetzner is an explicit SSH/Dokploy operation. GitHub receives no
  new server credential and no workflow auto-deploys production to Vercel.
- PostgreSQL 18 is private to the Compose network and persists in a named host
  volume. Cloudflare R2 stores images and encrypted six-hour database dumps.
- Runtime credentials belong only in Dokploy/container secrets and offline
  escrow, never in Git, workflow summaries, image layers, or logs.

The exact rehearsal, cutover, backup, acceptance, and rollback procedure lives
in [`deploy/cloud/`](deploy/cloud/README.md). Vercel is not a stateful rollback
target; Neon is retained disconnected for 14 days after cutover and requires
separate approval to delete.
