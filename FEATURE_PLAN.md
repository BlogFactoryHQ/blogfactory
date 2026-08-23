# BlogFactory release plan

This is the canonical forward plan for BlogFactory. It records intended work, not proof that a feature is shipped. Agents must verify checked items in the current code and must not present unchecked items as available.

## Product decision

BlogFactory launches open source and self-hosted first. BlogFactory Cloud is a later managed service and must be described as **coming soon** until its release gates are complete.

Planned hosted pricing:

| Plan | Monthly | Annual | Planned limits |
| --- | ---: | ---: | --- |
| Community | Free | Free | Self-hosted, bring your own AI, community support |
| Cloud | $5 | $49 | 1 workspace, 3 sites, 1 GB storage, 1 concurrent generation |
| Cloud Advanced | $15 | $149 | 1 workspace, 10 sites, 10 GB storage, 3 concurrent generations, priority queue |
| Enterprise | Contact us | Contact us | Custom workspaces, limits, isolation, SSO, SLA, and onboarding |

There is no founder plan, lifetime hosting, launch discount, checkout, subscription, or entitlement implementation.

## Phase 0 — open-source release

### Implemented in the release candidate

- [x] Docker Compose topology for web, API, PostgreSQL, MinIO, migrations, and the bounded scheduler.
- [x] Self-hosted account creation is explicit and can be disabled after the administrator account is created.
- [x] Self-hosting runbook, environment template, health checks, and persistent volumes.
- [x] Repository and marketing copy distinguish self-hosting from the future managed Cloud service.
- [x] Runtime signup configuration, instance-local MCP URL resolution, PostgreSQL/MinIO readiness, and fail-closed self-host secrets.
- [x] Versioned Compose image contract, source-build fallback, multi-architecture GHCR workflow, and disposable smoke/restore workflows.
- [x] Railway service topology and config-as-code contracts; marketplace publication still requires a real-project acceptance run.

### Required before calling the release public

- [x] Add the owner-selected AGPL-3.0-only license.
- [x] Audit the current tree and Git history for secrets, private customer data, licensed assets, and internal-only documents.
- [x] Confirm every bundled screenshot and brand asset is cleared for public redistribution.
- [x] Run the Docker Compose stack on a machine with a working Docker daemon and complete the smoke test in `docs/self-hosting.md`.
- [x] Preserve the existing Git history, subject to the public-release audit below.
- [ ] Make `BoraGkc/blogfactory` public and verify the anonymous clone path.
- [ ] Create a tagged release and attach upgrade/migration notes.
- [ ] Deploy the prepared “Open source / Cloud coming soon” marketing copy only after the source URL is public.

## Phase 1 — self-host distribution

- [ ] Publish a versioned container image after the first tagged release.
- [ ] Add a Railway template based on the same container and environment contract.
- [ ] Add a Render Blueprint only after its full web/API/worker flow passes the same smoke test.
- [ ] Submit to self-hosted directories after the repository, license, documentation, and release history satisfy each directory's rules.
- [ ] Add upgrade, backup, restore, and rollback acceptance checks to each release.

Netlify is not a full BlogFactory deployment target because it does not provision the complete API, worker, PostgreSQL, and object-storage topology. Do not add a misleading one-click badge.

## Phase 2 — BlogFactory Cloud

- [ ] Replace process-local background continuation with PostgreSQL-backed jobs, leases, retries, and worker heartbeats.
- [ ] Implement verified email, password recovery delivery, abuse controls, and production login acceptance.
- [ ] Add authoritative usage counters for sites, storage, scheduled work, and concurrent generation.
- [ ] Add server-side plan entitlements for Cloud and Cloud Advanced. The web may display them but is not the authority.
- [ ] Choose a billing provider and implement idempotent webhooks outside MCP authority.
- [ ] Add export, cancellation, retention, backup/restore, spend caps, and support policies.
- [ ] Run a bounded private pilot and measure real infrastructure and support cost before public checkout.

## Release language

Until Phase 0 is complete:

- Say: “Open-source release candidate. BlogFactory Cloud is coming soon.”
- Do not say: “Open source available now,” “one-click deploy,” or “hosted for $5” on a live public surface.

After Phase 0 is complete:

- Say: “Self-host BlogFactory for free. BlogFactory Cloud is coming soon.”
- Link the primary CTA to the public source repository.
- Keep Cloud pricing informational until checkout and entitlements are actually live.
