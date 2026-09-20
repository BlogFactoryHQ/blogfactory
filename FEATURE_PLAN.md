# BlogFactory release plan

This is the canonical forward plan for BlogFactory. It records intended work, not proof that a feature is shipped. Agents must verify checked items in the current code and must not present unchecked items as available.

## Product decision

BlogFactory launches open source and self-hosted first. BlogFactory Cloud is a later managed service and must be described as **coming soon** until its release gates are complete.

Cloud packaging is fixed for launch: Cloud is $5 monthly or $49 yearly with 3 sites, 1 GB storage, 1 concurrent generation, 3 active RSS feeds, and 150 successful drafts per UTC month. Advanced is $15 monthly or $149 yearly with 10 sites, 10 GB, 3 concurrent generations, 20 active RSS feeds, unlimited manual creation, and up to 600 automated drafts per UTC month. A separate $20 top-up grants 14,000 Managed AI Credits for 365 days; plans include no AI credits and BYO OpenRouter remains available.

Polar is the payment layer. The private Cloud PostgreSQL database remains authoritative for entitlements, quotas, and spendable credits. Public signup and these prices remain **coming soon** until the unchecked launch gates below pass.

## Phase 0 — open-source release

### Implemented in the release candidate

- [x] Docker Compose topology for web, API, PostgreSQL, MinIO, migrations, and the bounded scheduler.
- [x] Self-hosted account creation is explicit and can be disabled after the administrator account is created.
- [x] Self-hosting runbook, environment template, health checks, and persistent volumes.
- [x] Repository and marketing copy distinguish self-hosting from the future managed Cloud service.
- [x] Runtime signup configuration, instance-local MCP URL resolution, PostgreSQL/MinIO readiness, and fail-closed self-host secrets.
- [x] Versioned Compose image contract, source-build fallback, multi-architecture GHCR workflow, and disposable smoke/restore workflows.
- [x] Railway service topology and config-as-code contracts; marketplace publication still requires a real-project acceptance run.
- [x] Dokploy five-service blueprint, generated-secret contract, upstream validators, and disposable real-instance acceptance workflow.

### Required before calling the release public

- [x] Add the owner-selected AGPL-3.0-only license.
- [x] Audit the current tree and Git history for secrets, private customer data, licensed assets, and internal-only documents.
- [x] Confirm every bundled screenshot and brand asset is cleared for public redistribution.
- [x] Run the Docker Compose stack on a machine with a working Docker daemon and complete the smoke test in `docs/self-hosting.md`.
- [x] Preserve the existing Git history, subject to the public-release audit below.
- [x] Run the Dokploy blueprint on a disposable GitHub Actions instance and pass the Docker-equivalent health, signup, storage, MCP, scheduler, and persistence acceptance ([RC acceptance](https://github.com/BlogFactoryHQ/blogfactory/actions/runs/32888770507)).
- [x] Make `BlogFactoryHQ/blogfactory` public and verify the anonymous clone path.
- [x] Create a tagged release and attach upgrade/migration notes ([v0.1.0](https://github.com/BlogFactoryHQ/blogfactory/releases/tag/v0.1.0)).
- [x] Deploy the private-site “Open source / Cloud coming soon” marketing copy after the source URL became public.

## Phase 1 — self-host distribution

- [x] Publish versioned public multi-architecture API and web container images after the first tagged release.
- [ ] Submit the accepted Dokploy blueprint to the public template catalog and add its deploy link only after upstream merge.
- [ ] Publish a Railway template only after a separate real-project acceptance run; Railway is not a Phase 0 gate.
- [ ] Add a Render Blueprint only after its full web/API/worker flow passes the same smoke test.
- [ ] Submit to self-hosted directories after the repository, license, documentation, and release history satisfy each directory's rules.
- [ ] Add upgrade, backup, restore, and rollback acceptance checks to each release.

Netlify is not a full BlogFactory deployment target because it does not provision the complete API, worker, PostgreSQL, and object-storage topology. Do not add a misleading one-click badge.

## Phase 2 — BlogFactory Cloud

- [ ] Replace process-local background continuation with PostgreSQL-backed jobs, leases, retries, and worker heartbeats.
- [ ] Complete production acceptance for WorkOS AuthKit login, verification/reset mail, Turnstile, rate limits, existing-user migration, and logout/session revocation.
- [ ] Add authoritative usage counters for sites, storage, scheduled work, and concurrent generation.
- [ ] Decide managed Cloud packaging and add server-side entitlements. The web may display them but is not the authority.
- [ ] Choose a billing provider and implement idempotent webhooks outside MCP authority.
- [ ] Add export, cancellation, retention, backup/restore, spend caps, and support policies.
- [ ] Run a bounded private pilot and measure real infrastructure and support cost before public checkout.
- [ ] Pass real Polar sandbox checkout, webhook idempotency/order, portal, cancellation, grace, refund, chargeback-debt, and reconciliation acceptance for all five SKUs.
- [ ] Obtain written Polar acceptance for the AI-content use case and written OpenRouter confirmation for BlogFactory Managed AI; complete human legal review.
- [ ] Verify production purchase/refund, live webhook readback, tenant-scoped entitlement enforcement, email delivery, Turnstile, and rate-limit acceptance before enabling public signup.
- [ ] Keep marketing Cloud availability disabled until the live app checkout, portal, entitlements, and read-only fallback are independently verified.

## Release language

Until Phase 0 is complete:

- Say: “Open-source release candidate. BlogFactory Cloud is coming soon.”
- Do not say: “Open source available now,” “one-click deploy,” or “hosted for $5” on a live public surface.

After Phase 0 is complete:

- Say: “Self-host BlogFactory for free. BlogFactory Cloud is coming soon.”
- Link the primary CTA to the public source repository.
- Keep Cloud pricing informational until checkout and entitlements are actually live.
