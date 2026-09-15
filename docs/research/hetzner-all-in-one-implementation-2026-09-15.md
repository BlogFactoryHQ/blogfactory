# Hetzner all-in-one implementation evidence — 2026-09-15

This record covers repository and CI implementation only. Production cutover
has not started because the existing SSH key is still rejected by the Hetzner
host. Neon, Cloudflare DNS/proxy, R2, WorkOS, and the running stack remain
unchanged.

## Source isolation

- Public branch: `codex/hetzner-all-in-one-core`
- Public commit: `6ae7238`
- Private branch: `codex/hetzner-all-in-one-cloud`
- Private tested commit: `c075ef6`
- Original public and private dirty worktrees, including private `.wrangler/`,
  were not modified.

## Provider readback

- Neon organization: `BlogFactory` (`org-falling-leaf-46216380`)
- Neon project: `Blogfactory` (`solitary-poetry-32212274`)
- Region/database engine: Frankfurt `aws-eu-central-1`, PostgreSQL 18
- Production branch: `production` (`br-tiny-pond-b1sd9a8y`)
- No Neon setting, compute, branch, role, database, or credential was mutated.
- The existing R2 credential was not rotated or written to the repository.

## CI acceptance

[Build Cloud images run 34948408015](https://github.com/BlogFactoryHQ/blogfactory-cloud/actions/runs/34948408015)
passed on commit `c075ef6`:

- 52 backend self-tests
- disposable PostgreSQL 18 integration and migrations
- web typecheck, 156 tests, and production build
- shell syntax, backup logic self-test, and Compose config validation
- idempotent owner/runtime role setup and runtime schema-create rejection
- backup image build with PostgreSQL 18 client, age, and AWS CLI
- encrypted custom dump, S3 upload/readback, manifest verification, scratch
  restore, migration fingerprint, and all-table row-count comparison
- API, web, and backup GHCR publication by immutable digest

Immutable images from the passing run:

```text
ghcr.io/blogfactoryhq/blogfactory-cloud-api@sha256:66a2d97bc922e8c7514c852e719e76c60d463c0de184ecbc7f97d5d994ac1382
ghcr.io/blogfactoryhq/blogfactory-cloud-web@sha256:0006cdbbe2d12a48d45a085e4b9e23c1d36e522fe8d17e580f917fae12a93c37
ghcr.io/blogfactoryhq/blogfactory-cloud-backup@sha256:b58b6943cf8a79a5274d79098da71997da940109fd1abb9c0341d6937855033d
```

Resolved deployment inputs:

```text
postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6
```

The PostgreSQL named volume targets `/var/lib/postgresql`; PostgreSQL 18 moved
the official image volume from the historical `/var/lib/postgresql/data` path.

## Remaining gate

This command still fails with `Permission denied (publickey)`:

```bash
ssh -i ~/.ssh/blogfactory_cloud deploy@188.245.220.143
```

After the public key is installed for `deploy`, the next action is the isolated
rehearsal in `deploy/cloud/README.md`. Production data must not move and Neon
must not be suspended until rehearsal, encrypted R2 readback, scratch restore,
role separation, and application/MCP acceptance all pass.
