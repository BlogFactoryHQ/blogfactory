# Polar, WorkOS, and Hetzner handoff

## Current state

- Branch: `codex/polar-billing-managed-ai`, based on `e289b01`.
- Polar production catalog and webhook have been configured and read back previously. Never place organization tokens or webhook secrets in Git, logs, or this document.
- Local ignored `.env` contains the Polar and WorkOS values. Hosted-Cloud readiness configuration passes locally.
- Billing, entitlement enforcement, Managed AI, WorkOS AuthKit, and the Hetzner Compose rehearsal are implemented but not deployed.
- All public launch flags remain false. Do not enable them during the Hetzner migration.

## What is implemented

- Five Polar products, server-side checkout and customer portal, signed idempotent webhook inbox, reconciliation, entitlement states, and 60-day transition grants.
- Cloud and Advanced limits, atomic site/RSS/storage/concurrency controls, successful-draft quotas, and read-only behavior after entitlement loss.
- Managed AI prepaid credits: FIFO grants, reservations, provider-cost settlement, expiry, refunds, chargeback debt, and BYO/Managed/Auto preference.
- WorkOS-only hosted auth with sealed HttpOnly sessions. Local password JWT fallback is disabled in Cloud mode. Community/self-hosted auth remains unchanged.
- Hetzner Compose stack includes PostgreSQL, API, worker, RSS scheduler, six-hour maintenance scheduler, backup, and web. Dokploy is optional host-side deployment tooling, not a product requirement.

The canonical operating detail is in [billing.md](billing.md) and [the Cloud deployment runbook](../deploy/cloud/README.md).

## Verified locally

```bash
npm run test:server       # 59/59 backend self-tests
npm run test --workspace=web  # 42 files, 156 tests
npm run build
npm run typecheck
npm run lint --workspace=web  # warnings only, no errors
git diff --check
docker compose -f deploy/cloud/compose.yaml config --quiet
```

The PostgreSQL integration test now covers migration idempotency, tenant isolation, concurrent credit/quota/site/RSS/storage limits, failed draft rollback, stale webhook recovery, duplicate/out-of-order Polar events, and refund debt. It is intentionally guarded and must run only against a disposable database:

```bash
POSTGRES_INTEGRATION_ALLOW_WRITES=1 DATABASE_URL=<disposable-url> npm run test:postgres
```

Docker Desktop was not running on the development machine, so that final disposable PostgreSQL acceptance was not executed locally.

## Required next steps

1. Restore Hetzner SSH access for `deploy@188.245.220.143`. The checked key is `/Users/boragokce/.ssh/blogfactory_cloud`; the latest read-only attempt failed with `Permission denied (publickey)`.
2. On the host, create a root-only deployment env file from `deploy/cloud/.env.example`; enter separate production values into the host secret store. Do not copy the local `.env` file.
3. Run the isolated rehearsal in `deploy/cloud/README.md`: restore a fresh Neon dump into a separate Compose project, migrate, run health/MCP/R2/backup checks, then execute `npm run test:postgres` against that disposable rehearsal database.
4. Keep `CLOUD_PUBLIC_SIGNUP=false`, `CLOUD_BILLING_ENFORCEMENT=false`, and `MANAGED_AI_ENABLED=false` through migration and internal acceptance.
5. Before public launch: rotate the Polar token that was pasted into chat, obtain Polar AUP and OpenRouter Managed AI confirmation, complete legal review, perform a real low-value purchase/refund, set `CLOUD_PUBLIC_LAUNCH_AT`, run `npm run billing:grant-transition`, and only then enable the launch flags together.

## Safety boundaries

- Polar is payment transport only; BlogFactory PostgreSQL remains the authority for access, quotas, and AI balances.
- Checkout success redirects never grant access.
- CMS output is draft-only; this work does not add live publishing.
- Do not run PostgreSQL integration tests against production, Neon, or any shared database.
