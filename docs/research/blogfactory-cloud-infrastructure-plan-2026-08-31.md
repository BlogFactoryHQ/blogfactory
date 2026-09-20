# BlogFactory Cloud infrastructure plan — 2026-08-31

## 1. Executive recommendation

**[Proposed design]** Approve a hybrid private-pilot topology: Cloudflare remains the marketing/DNS/TLS/CDN/WAF front door, thin cron wakeup, and R2 object store; one Hetzner CPX22 runs Nginx/static app, the Hono API/MCP, and a separate persistent worker container; Neon Launch supplies pooled PostgreSQL with 7-day PITR; existing WorkOS supplies OAuth; Resend Free supplies verification/recovery email; Better Stack Free supplies errors, bounded logs, uptime, and heartbeats; GitHub Actions/GHCR supplies CI and images. It is approximately **$36–42/month before location-dependent tax** at pilot load, including the seven-slot VM backup service, and leaves an unavoidable **$28.19/month** compute floor before tax.

**[Proposed design]** This is a pilot architecture, not a commitment to Kubernetes, Redis, Kafka, microservices, or an external queue. PostgreSQL is the authoritative queue and claim store; containers separate failure and deployment domains without inventing distributed coordination.

## 2. Current verified baseline

**[Repository evidence]** Claims tagged `Repository evidence` were checked in public core commit `2b041122744941a6fc0db6d58d1826cc5c776d6a` and its current dirty working tree. The starting status, preserved verbatim, was:

```text
 M server/src/routes/posts.ts
 M server/src/services/control-plane.self-test.ts
 M server/src/services/control-plane.ts
 M server/src/services/post-revisions.ts
 M web/src/pages/Overview.tsx
 M web/src/pages/ReviewQueue.tsx
?? docs/research/
?? server/src/services/post-revisions.self-test.ts
```

**[Repository evidence]** The private overlay is commit `3b855a4c6d92b9690f30bc7c48743caebeb24904`; only its deployment-ownership structure is used here. Its pre-existing untracked `.wrangler/` is preserved. No private source, secret, or plan detail is reproduced.

**[Live verified 2026-08-31]** Both health routes returned 200; the apex returned the Cloudflare-served Astro marketing site; unauthenticated MCP returned 401 with a Bearer challenge; OAuth protected-resource metadata returned 200. The production deployment SHA and account billing plans were **not** verifiable from public HTTP evidence.

**[Historical evidence]** Commit `505719a` bounded Search Console dates/columns, reused fetched metrics, and cached stored insights. Commits `64fc1b5` and `2b04112` reduced scheduler wakeups. The 129.7 MB table, 29 reads, and 3.76–4.13 GB figures are historical dashboard observations, not repository-recoverable measurements.

## 3. Workload and dependency inventory

**[Repository evidence]** Web and MCP are transports over tenant/site-scoped shared services; source of truth is PostgreSQL plus S3-compatible object storage. MCP is draft-only: no live publishing, delete, credential exposure, or account administration. `generate_draft` is asynchronous, `update_draft` is optimistic-locking, and draft delivery is versioned, destination-specific, idempotent, and draft-only.

**[Repository evidence]** The public core is one-way merged into the private Cloud overlay. The private marketing repository owns the Astro apex; the Cloud overlay owns hosted-app deployment. The new plan preserves that one-way boundary and does not put private code into the public core.

**[Repository evidence]** Current external dependencies discovered from configuration, imports, and callers are: Vercel serverless execution; Cloudflare Pages/front door and Cron; Neon-compatible PostgreSQL; S3-compatible storage (R2 in hosted production, MinIO in self-hosting); WorkOS AuthKit; OpenRouter and optional OpenAI/Google AI customer credentials; Google Search Console and Indexing APIs; WordPress, Ghost, Wix, and Framer draft destinations; Pexels, Pixabay, and Openverse image sources; GitHub/Hacker News/Reddit/RSS source fetches; and GitHub Actions/GHCR. Customer AI credentials remain bring-your-own and encrypted by the existing application layer; their inference charges are excluded, while BlogFactory compute, transfer, retries, and stored outputs are included.

**[Proposed design]** Smallest viable Cloud dependency set:

| Concern | Launch choice | Why no additional service |
| --- | --- | --- |
| DNS, TLS, CDN, WAF | Existing Cloudflare zone | Existing provider; coarse edge rule plus application quotas is sufficient for pilot |
| Authentication/OAuth | Existing WorkOS AuthKit | Already integrated; no second identity store |
| Transactional email | Resend Free, production domain authenticated | Closes verification/recovery gap without a mail server |
| Secrets | Dokploy/container secrets plus offline password-manager recovery copy | No new vault until multiple hosts/operators make rotation unsafe |
| Logs, errors, uptime, heartbeats | Better Stack Free with local bounded Docker logs | One provider covers the pilot observability gap |
| CI/CD and registry | Existing GitHub Actions and GHCR | Existing release path and immutable images |
| Billing/entitlements | None at pilot | Later server-side authority outside MCP after founder/security decision |

**[Live verified 2026-08-31]** PostgreSQL comparison. Prices exclude tax unless the provider says otherwise; restore times are not assumed and require experiment 14.

| PostgreSQL option | Price/compute/storage/transfer | Pooling and scale behavior | Backup, PITR, HA | Operator burden and exposure | Decision |
| --- | --- | --- | --- | --- | --- |
| Neon Launch | $0.106/CU-hour, $0.35/GB-month data, $0.20/GB-month history; 500 GB paid public transfer from 2026-06-01, then $0.10/GB | Autoscaling and configurable scale-to-zero; PgBouncer transaction-pool endpoint supports up to 10,000 client connections, while direct `max_connections` depends on compute size; copy-on-write branches | Selectable 7-day PITR window and managed distributed storage; portable exports still cover provider/account failure | Low burden; cold wake, restore time, active server connections, and cross-region transfer require measurement. Expected application downtime is bounded by connection retry/restore, not yet measured | **Pilot choice** |
| PostgreSQL 17 on CPX22 | Same-host DB adds no VM line but is unsafe; isolated minimum is another $28.19 backed-up VM, making two VMs $56.38 before offsite archive/monitoring/operator time | Native connections; operator supplies pool; no branching, managed HA, or scale-to-zero | Operator implements base backups, continuous WAL, encryption, retention, restore tests, upgrades, replication, failover, and monitoring | Highest burden; same-host loss can cause hours of downtime and data loss through the last usable WAL/archive. A standby adds another VM and failover work | Reject for pilot primary |
| AWS RDS PostgreSQL | Frankfurt price-list base: Single-AZ `db.t4g.micro` $0.019/hour + GP3 $0.137/GB-month, about **$16.61/month** at 730 hours and 20 GB; Multi-AZ about **$32.49/month** before backup overage/IO/transfer | 1 GiB burstable base is only a comparison floor; application pooling required; no scale-to-zero or Neon-style branching | Automated backups/PITR; Multi-AZ adds managed standby/failover, while Single-AZ remains an availability boundary | Medium burden; managed patching/failover but AWS account/network/transfer complexity. Frankfurt co-location can reduce latency; restore/failover downtime and outbound/cross-region transfer remain measurement required | Credible HA alternative, but no pilot advantage over usage-based Neon |

**[Live verified 2026-08-31]** Object-storage comparison. An object key is never authorization; the database row and authenticated access policy decide whether bytes are public.

| Store | Storage/requests/egress | Delivery and recovery | Compatibility/region/abuse | Decision |
| --- | --- | --- | --- | --- |
| Cloudflare R2 Standard | First 10 GB, 1M Class A, and 10M Class B monthly included; then $0.015/GB-month, $4.50/M A, $0.36/M B; direct egress $0 | Custom-domain CDN; lifecycle rules and prefix bucket locks; immutable unique keys. No assumed S3-style version-history restore | S3-compatible; location hint, WAF/hotlink controls, signed/proxied private reads | **Pilot choice** |
| Hetzner Object Storage | EUR 4.99/USD 5.99 minimum includes 1 TB storage and 1 TB egress; excess storage and egress metered; operations free | Public S3 delivery is not a global CDN; object expiry/lock features exist, but separate recovery design is still needed | S3-compatible; EU locations pair well with Hetzner compute | Good backup/exit target, but unnecessary fixed floor for pilot images |
| Amazon S3 Standard | Regional GB-month, request, retrieval, replication, and internet-transfer pricing | Mature versioning, lifecycle, replication, CloudFront integration | Broadest controls and lock-in surface; cross-region/internet transfer must be modeled | Reliability contender, not cost winner for public image delivery |

**[Proposed design]** Public/published images use immutable UUID-style keys through an R2 custom domain and CDN. Private originals and unapproved library images use a private prefix/bucket and short-lived signed URLs or an authenticated proxy. Apply upload byte/type/pixel limits, cache rules, referer-independent authorization for private bytes, per-tenant storage quotas, and Cloudflare hotlink/rate controls. Retain recoverable user uploads under a 30-day prefix lock; lifecycle only disposable generated derivatives after their database retention window.

## 4. Complete MCP map

**[Repository evidence]** `ACTIVE_MCP_TOOL_NAMES` contains exactly these 22 tools. “DB” means PostgreSQL; “provider” excludes opaque credentials; all calls remain site-scoped.

| Tool | Read/mutation; sync/async | Shared service | PG / object / external provider | Cost driver; bottleneck | Rate/concurrency | Failure and idempotency |
| --- | --- | --- | --- | --- | --- | --- |
| `whoami` | read; sync | `mcp/tools.ts` auth context | yes / no / WorkOS | auth DB lookup | token/OAuth burst | auth failure; read-only |
| `list_sites` | read; sync | `mcp/tools.ts` tenant authorization | yes / no / no | membership query | token/user page cap | read-only; never cross-user |
| `list_personas` | read; sync | `mcp/tools.ts` persona query | yes / no / no | scoped listing | bounded page/site | read-only |
| `list_publish_targets` | read; sync | `mcp/tools.ts` -> `services/publishing.ts` | yes / no / CMS metadata | destination lookup | site/token cap | read-only; no credential values |
| `list_posts` | read; sync | `mcp/tools.ts` post query | yes / no / no | indexed DB scan | required pagination | read-only; avoid full content rows |
| `get_post` | read; sync | `mcp/tools.ts` post/revision query | yes / no / no | one post plus revisions | site/token burst | read-only; current ownership check |
| `create_draft` | mutation; sync | `mcp/tools.ts` draft write -> SEO enqueue | yes / no / no | post/revision write | tenant mutation quota | client replay can duplicate without request key |
| `import_drafts` | mutation; sync | `mcp/tools.ts` batch import | yes / no / no | up to 20 post/revision writes | hard batch 20, tenant cap | retry only missing items/request key |
| `generate_draft` | mutation; **async** | `mcp/tools.ts` -> generation service / `jobs` | yes / optional / BYO AI | provider latency, worker CPU/network | tenant/site expensive-op cap | current continuation is process-local; pilot needs durable lease/heartbeat/dead state |
| `get_job` | read; sync | `mcp/tools.ts` -> `jobs` | yes / no / no | status polling | token plus client backoff | read-only; stale status reconciliation |
| `get_workspace_digest` | read; sync | `services/control-plane.ts` | yes / no / no | bounded aggregates | token/site cache | read-only; shared web/MCP classification |
| `list_action_items` | read; sync | `services/control-plane.ts` | yes / no / no | queue classification | pagination/site cap | read-only; shared source of truth |
| `review_post` | read; sync | `services/control-plane.ts` -> publishing preflight | yes / no / CMS metadata | revision/preflight reads | current-version/site cap | read-only Review Card; no delivery authority |
| `get_search_console_dashboard` | read; sync | `services/search-console.ts` | yes / no / cached Google data | bounded metric query | site/cache/range | read-only; projection/date bounds required |
| `get_search_console_insights` | read; sync | `services/optimize.ts` + Search Console cache | yes / no / cached Google data | metric scan/content reuse | site/cache/range | read-only; reuse one fetched dataset |
| `refresh_search_console` | mutation; sync/manual | `services/search-console.ts` | yes / no / Google | API quota and DB egress | manual/site/provider quota | explicit retry; no automatic scheduler refresh |
| `update_draft` | mutation; sync | `mcp/tools.ts` -> revision service | yes / no / no | revision insert/update | site mutation cap | `expected_updated_at` optimistic conflict |
| `push_to_cms_draft` | mutation; sync | `services/publishing.ts` | yes / possible image reads / CMS | CMS latency and media transfer | destination/site concurrency | current version + destination idempotency; draft-only |
| `inspect_search_console_url` | read; sync | `services/search-console.ts` | yes / no / Google inspection | one provider call | per-site URL/provider quota | read-only; cache result where valid |
| `batch_inspect_search_console_urls` | read; sync | `services/search-console.ts` | yes / no / Google inspection | bounded provider batch | hard batch + site quota | partial result; retry failed subset only |
| `list_search_console_sitemaps` | read; sync | `services/search-console.ts` | yes / no / Google | one provider request | site/provider quota | read-only; no arbitrary provider access |
| `query_search_console_analytics` | read; sync | `services/search-console.ts` | yes / no / Google/cache | DB/provider rows and transfer | complete-date/range/row caps | read-only; cache and select columns |

## 5. Complete cron and background map

**[Repository evidence]** Current generation may continue process-locally; RSS uses PostgreSQL feed leases; campaigns, SEO, images, indexing, and retention already have bounded drains. Historical automatic Search Console refresh is history; current refresh is manual.

| Workload | Trigger and exact current code path | Scope/duration | Claim/idempotency/retry | Concurrency/cost/web-safe | Cloud pilot location |
| --- | --- | --- | --- | --- | --- |
| Web/MCP generation | web/MCP request -> generation service; `routes/jobs.ts` currently uses Vercel `waitUntil` for retry continuation | site; AI-bound, potentially minutes | `jobs` status today; pilot adds atomic lease, heartbeat, capped retry/dead state and request idempotency | tenant cap/BYO-AI network; API must return job rather than execute | Hetzner worker |
| RSS feeds | `routes/cron.ts` -> `services/scheduler.ts:runScheduler` -> `services/feed-run-lease.ts` | user/feed; bounded posts per run | `feeds` atomic PostgreSQL lease and release/reclaim; post/delivery idempotency still applies | feed slots, remote RSS/CMS/AI network; thin wake is web-safe | Hetzner worker |
| Campaign items | `routes/cron.ts` or campaign routes -> `services/campaign-runner.ts:drainCampaignQueue` | user/campaign/item; bounded campaigns/items | `campaign_items` status claim, `reconcileStaleCampaignItems`, explicit failed-item retry | per-campaign/tenant cap; AI and DB writes | Hetzner worker |
| SEO metadata | `routes/cron.ts` -> `services/seo-metadata.ts:drainSeoMetadata` | user/post; bounded drain | `jobs` pending/running claim; `recoverStalledSeoMetadataJobs`; source-hash protection | tenant cap, AI request, content read; wake only web-safe | Hetzner worker |
| Deferred images | `routes/cron.ts` -> low-cost image facade -> `services/ai-image-queue.ts:drainDeferredImages` | user/site/request; bounded drain | `image_generation_requests`; three total attempts, 10–120 minute backoff, stale processing reconcile | provider and R2 request/bytes; wake only web-safe | Hetzner worker |
| Google indexing | `routes/cron.ts` -> `services/indexing.ts:drainQueuedGoogleIndexing` | user/site/submission; bounded 50 default | `indexing_submissions` durable status/backlog; quota failures remain retryable | per-site/provider quota; Google network | Hetzner worker |
| Search Console refresh | MCP/API manual request -> `services/search-console.ts`; historical `routes/cron.ts:drainSearchConsoleSync` is code evidence, not recommended automatic policy | user/site/date range; provider-bound | explicit request, bounded dates/columns, cached query/insight rows; retry respects Google quota | Google calls plus DB row egress; request may enqueue worker | API claim, Hetzner worker execution |
| Operation-event retention | `routes/cron.ts` all-task -> `services/operation-events.ts:purgeExpiredOperationEvents` | global expiry, short | `operation_events` delete by 30-day cutoff is idempotent | bounded DB delete; wake is web-safe | Hetzner worker |
| OpenRouter webhooks | `routes/webhooks.ts` receives provider callback and persists result | job/user/site derived from stored job; short ingress | authenticate webhook, persist-before-ack, duplicate event/reconciliation guard | public ingress and DB write; handler is web-safe | Hetzner API, reconciled by worker |
| User-triggered retries | `routes/jobs.ts/:id/retry`, `routes/images.ts`, and campaign/post retry routes | authenticated user/site and selected failed work | create/transition only scoped failed work; preserve attempt caps/backoff/dead state | expensive-op quota; worker executes | Hetzner worker |
| Internal-link indexing/crawl | `routes/settings.ts:/internal-linking/index` -> `services/internal-linking.ts:buildInternalLinkIndex` with current background continuation | user/site sitemap; network/embedding-bound | progress state on scoped settings; pilot claim/idempotency needed before worker handoff | crawl/embedding concurrency, BYO provider, content/network bytes; not API-safe | Hetzner worker |

**[Proposed design]** PostgreSQL alone owns eligibility and claims. The worker executes every row above. Cloudflare Cron only authenticates and wakes the API/worker; GitHub Actions is manual/emergency operational fallback, never the queue.

## 6. Current cost and egress risk

**[Historical evidence]** The Search Console repair was prompted by a historical large-table/egress observation, not a current bill: 129.7 MB, 29 reads, and 3.76–4.13 GB are not reconstructable from git. Commit `505719a` proves the narrower query, reuse, and seven-day stored-insights cache; commits `64fc1b5` and `2b04112` prove wakeup reduction.

**[Live verified 2026-08-31]** R2's direct delivery egress is free but request classes are billed after allowance. Neon’s published paid-plan transfer allowance was increased to 500 GB; therefore it is incorrect to call 100 GB the current allowance. This report retains 100 GB only as a conservative sensitivity threshold. VM cost is fixed; Neon compute/egress, R2 requests, providers, and logs are variable.

## 7. Candidate diagrams

**[Proposed design]** Candidate 1 — managed/serverless continuation:

```text
browser / MCP
      |
Cloudflare marketing + compatibility proxy
      |
Vercel static app + 60-second Hono function
      |------------------- WorkOS / CMS / Google / BYO AI
      +---- Neon PostgreSQL
      `---- Cloudflare R2
Cloudflare Cron / GitHub Actions ---- thin HTTP wakeups
```

The function deployment is horizontally elastic for requests, but persistent work still needs durable PostgreSQL claims plus a worker-capable execution destination. Treating `waitUntil` as a queue would preserve the current interruption risk.

**[Proposed design]** Candidate 2 — Hetzner-first:

```text
browser / MCP -> Cloudflare -> CPX22 / Dokploy
                                  |- Nginx + static app
                                  |- Hono API/MCP
                                  |- worker
                                  |- PostgreSQL volume
                                  `- S3 client -> Hetzner Object Storage
offsite DB/WAL export ---------------------^
```

This is deployable, but API, workers, database, and primary disk share a host failure domain unless the database is expanded into a second-host replication and backup design.

**[Proposed design]** Candidate 3 — recommended hybrid:

```text
Browser/MCP -> Cloudflare (DNS, TLS, WAF, CDN) -> Nginx on CPX22
                                                    |- static React
                                                    |- Hono API/MCP
                                                    `- worker container <-> Neon PostgreSQL
Cloudflare R2 <--------------------------------------^       |\
  public immutable assets / private signed proxy             | `-> WorkOS, CMS, AI, Google, Resend
Cloudflare Cron ------------------------------------> wakeup  `-> Better Stack heartbeats
GitHub Actions -> GHCR immutable image -> CPX22 deploy
```

**[Proposed design]** The first failure is the single compute node; Cloudflare, Neon, and R2 retain edge/data availability. Recovery is redeploying the last immutable GHCR image to a replacement VM, restoring only if Neon/PITR or encrypted export is required. Unsuitable when API p95/CPU/backlog triggers in section 12 are met.

### Candidate 1 — Vercel continuation

**[Proposed design]** Flow: Cloudflare -> Vercel Pro application/API -> Neon -> R2, with thin edge/workflow triggers. It has low server operations and good burst scaling, but process lifetime/continuation makes persistent generation and drains the first failure mode. Cost is less predictable once Pro, function duration, invocation, and database egress rise; migration effort is lowest because it resembles current hosting. It becomes unsuitable at **more than 10,000 async jobs/month or any job backlog that cannot be completed inside bounded function execution**.

**[Proposed design]** Static assets and request handlers autoscale by platform concurrency and deploy atomically with instant rollback; no always-on worker exists. Every job therefore has to claim a small database unit, execute within the repository’s 60-second function configuration, checkpoint, and re-wake. Cold starts and region-to-Neon latency are measurement required. Failure boundary is a deployment/function timeout rather than a worker host; recovery depends on durable DB jobs plus retries. Lock-in is higher around serverless limits. Egress is chiefly Neon-to-function and function-to-provider traffic; R2 delivery remains egress-free but request-billed. Free edge allowances do not make Vercel Pro commercial hosting free.

### Candidate 2 — Hetzner-first local data

**[Proposed design]** Flow: Cloudflare -> CPX22/Dokploy -> local PostgreSQL and Hetzner Object Storage. It is initially cheap and has simple low-latency local DB access, but one machine holds compute and primary data. The first failure is VM/disk/database failure; recovery requires upgrades, monitoring, WAL/offsite backups, restore drills, standby/failover work, and materially worse RPO/RTO. It becomes unsuitable at **any accepted pilot RPO below 24 hours or RTO below four hours without additional database infrastructure**.

**[Proposed design]** Nginx, API, worker, and PostgreSQL have no request cold start and share low-latency local networking. Deploy safety comes from immutable images and health-gated rollback, but an image rollback cannot roll back damaged data. The VM has fixed capacity and outbound allowance; object delivery either traverses Hetzner or needs a separate CDN. Scaling requires separating DB before compute, then adding a standby/load balancer. It offers low application lock-in but the highest operator burden and migration risk. It is not recommended.

### Candidate 3 — recommended hybrid

**[Proposed design]** Hybrid splits front door, compute, database, and objects without turning jobs into a separate distributed system. API/worker containers have no per-request cold start; Neon may scale to zero and wake, so database cold latency is measurement required. Cloudflare absorbs static/image delivery and coarse abuse traffic; CPX22 handles API/MCP and persistent claims. The first failure is CPX22; Neon/R2 remain off-box. Recovery is image redeploy plus DB-backed claim recovery. Deploys are immutable and health-gated, with Cloudflare origin rollback. Scaling is worker VM first, then API VM/load balancer, then Neon; migration risk is moderate but bounded by shadow deployment and DNS rollback. Cross-provider compute-to-Neon and compute-to-R2/provider bytes are explicit egress paths and should use nearby EU regions.

## 8. Comparison and scoring

**[Proposed design]** Candidate comparison, including fixed/variable cost, free allowances, egress, single point of failure, backup/recovery, operations, scaling, lock-in, migration, first failure, and numeric rejection point:

| Candidate | Fixed / variable / free allowance | Egress and SPOF | Security, backup, recovery | Operations/scaling/lock-in/migration | First failure; unsuitable trigger |
| --- | --- | --- | --- | --- | --- |
| Vercel continuation | Vercel Pro **$20/user-month** with $20 usage credit, plus variable functions/Neon/R2; Hobby is non-commercial | Neon-to-function material; function continuation is job SPOF | managed data, durable jobs still required | low ops/high serverless lock-in/lowest migration | function duration/continuation; >10k async jobs/month |
| Hetzner-first | CPX22/IPv4/backup **$28.19** + Hetzner Object Storage **$5.99 minimum = $34.18**, but local DB operations/recovery are not priced | local traffic cheap; VM+DB/disk SPOF | operator-owned WAL/offsite/restore; weaker RPO/RTO | highest ops; DB split required; low lock-in/high migration | VM/database loss; RPO <24h or RTO <4h |
| Hybrid | $28.19 compute floor + managed variables; cited free tools only in allowance | R2 delivery $0, requests billed; CPX22 compute SPOF | Neon PITR + encrypted R2 export + VM backup/rebuild | moderate ops; VM then worker/API scale; moderate lock-in/migration | CPX22 loss; section 12 triggers |

| Criterion (5 best) | Vercel continuation | Hetzner-first | Hybrid |
| --- | ---: | ---: | ---: |
| Security/recovery | 4 | 2 | 5 |
| Cost predictability | 2 | 4 | 5 |
| Job suitability | 2 | 5 | 5 |
| Operations | 4 | 2 | 4 |
| Scaling | 4 | 2 | 4 |
| Migration risk | 5 | 2 | 4 |
| **Total** | **21** | **17** | **27 — first** |

## 9. Scenario cost tables and formulas

**[Live verified 2026-08-31]** Current published inputs are cited directly: [Hetzner Cloud pricing](https://www.hetzner.com/cloud/) (accessed 2026-08-31), [Neon pricing](https://neon.com/pricing) and [pricing limits](https://neon.com/docs/introduction/plans) (accessed 2026-08-31), [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (accessed 2026-08-31), [Better Stack pricing](https://betterstack.com/pricing) (accessed 2026-08-31), [WorkOS pricing](https://workos.com/pricing) (accessed 2026-08-31), [Resend pricing](https://resend.com/pricing) (accessed 2026-08-31), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) and [GitHub Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages) (accessed 2026-08-31), and [ECB USD reference rate](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html) (latest available 2026-08-27, EUR 1 = USD 1.1645).

**[Live verified 2026-08-31]** Neon Launch publishes $0.106/CU-hour, $0.35/GB-month data, $0.20/GB-month history, selectable up-to-seven-day time travel, and metered egress. R2 publishes 10 GB storage, 1 million Class A, and 10 million Class B requests included monthly; then $0.015/GB-month, $4.50/million Class A, and $0.36/million Class B, with direct delivery egress free. Cloudflare Workers Free is $0 only within its request/CPU allowance; static Pages assets are free, while Pages Functions bill as Workers.

**[Live verified 2026-08-31]** Better Stack Free includes monitors/heartbeats, error tracking, and bounded log retention; WorkOS User Management has a published free allowance; Resend Free has published email/day/month/domain limits; public-repository GitHub Actions is free and GitHub documents GHCR package storage/bandwidth policy. Check those cited pages at procurement time because allowances and plans can change.

**[Live verified 2026-08-31]** Hetzner's current price-adjustment table publishes CPX22 at **EUR 19.49/month** (native price) and **USD 22.99/month** (published USD price), each excluding IPv4; the pilot model uses IPv4 at $0.60/month. Hetzner prices exclude VAT. All other tax is billing-location dependent. The fixed VM formula is **$22.99 + $0.60 + 20% backups ($4.60) = $28.19/month before tax**; backups retain seven copies. See [Hetzner’s 2026 price table](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) and [backup billing FAQ](https://docs.hetzner.com/cloud/billing/faq/) (accessed 2026-08-31).

**[Proposed design]** Formulas (variable units are measured monthly):

```text
Neon = CU-hours × $0.106 + database GB × $0.35 + history GB × $0.20
       + max(0, egress GB - 500) × $0.10
R2 = max(0, storage GB - 10) × $0.015 + Class A/B requests above allowance
R2 delivery egress = $0
weekly encrypted exports = four retained copies ~= 2 × database size in R2
                           at 0.5 compression; Neon export egress ~= 4 × database size
```

**[Live verified 2026-08-31]** Neon increased every paid plan from 100 GB to **500 GB included public transfer on 2026-06-01**. The 100 GB value remains only an internal warning threshold so a regression is investigated well before paid overage; it is not used as the current billing allowance. Better Stack, WorkOS, Resend, Cloudflare Pages/Workers, GitHub Actions, and GHCR are modeled at $0 only while their cited free allowances hold. These are allowances, not contractual zero-cost promises.

### Workload scenarios

**[Proposed design]** Assumptions:

| Scenario | Orgs / users / sites | API+MCP | Posts / revisions | async jobs | Images | R2 storage/delivery | PG storage/egress | logs | avg/peak concurrency |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Idle | 1 / 2 / 2 | 2,000 | 20 / 40 | 50 | 20 | 1 GB / 2 GB | 1 GB / 2 GB | 0.5 GB | 0.02 / 2 |
| Pilot | 5 / 15 / 20 | 50,000 | 500 / 1,000 | 2,000 | 1,000 | 10 GB / 50 GB | 5 GB / 20 GB | 2 GB | 0.1 / 10 |
| Early paid | 25 / 75 / 100 | 500,000 | 5,000 / 15,000 | 20,000 | 10,000 | 50 GB / 500 GB | 20 GB / 80 GB | 5 GB | 1 / 30 |
| Growth | 100 / 400 / 500 | 5,000,000 | 50,000 / 150,000 | 200,000 | 50,000 | 250 GB / 5 TB | 75 GB / 300 GB | 20 GB | 10 / 100 |

**[Proposed design]** Reproducible service assumptions: Neon uses 20/60/180/720 CU-hours, history storage at 50% of live database size, and current 500 GB transfer allowance. R2 billable storage includes live objects plus four compressed weekly exports (approximately `2 × DB GB`). Idle/pilot/early request counts stay inside the R2 request allowance; growth assumes 3M Class A and 30M Class B origin operations after CDN caching. Better Stack stays within Free through pilot, uses bounded Free ingestion for early paid, and moves to the $30 monthly Nano telemetry bundle in growth. Resend stays Free through early paid and uses $20 Pro in growth. WorkOS, Cloudflare edge/cron, GitHub Actions, and GHCR have zero incremental cost only within cited allowances.

| Service formula (USD, pre-tax) | Idle | Pilot | Early paid | Growth |
| --- | ---: | ---: | ---: | ---: |
| Hetzner CPX22 + IPv4 + 20% backups | 28.19 | 28.19 | 28.19 | 28.19 |
| Neon compute `CUh × 0.106` | 2.12 | 6.36 | 19.08 | 76.32 |
| Neon data `DB GB × 0.35` | 0.35 | 1.75 | 7.00 | 26.25 |
| Neon history `0.5 × DB GB × 0.20` | 0.10 | 0.50 | 2.00 | 7.50 |
| Neon egress `max(0, GB - 500) × 0.10` | 0 | 0 | 0 | 0 |
| R2 storage including four exports | 0 | 0.15 | 1.20 | 5.85 |
| R2 requests above 1M A / 10M B | 0 | 0 | 0 | 16.20 |
| Better Stack | 0 | 0 | 0 | 30.00 |
| Resend | 0 | 0 | 0 | 20.00 |
| WorkOS / Cloudflare Pages+Cron / GitHub+GHCR | 0 | 0 | 0 | 0 within allowance |
| **Modeled total** | **30.76** | **36.95** | **57.47** | **210.31** |
| **Headroom to $60 launch ceiling** | **29.24** | **23.05** | **2.53** | **over by 150.31** |
| Fixed / variable | 28.19 / 2.57 | 28.19 / 8.76 | 28.19 / 29.28 | 28.19 / 182.12 |
| Largest uncertainty | Neon wake/CUh | worker duration/CUh | hot tenant and retries | extra VM count and DB compute |
| Likely surprise vector | backup/export transfer | repeated content reads | connection and retry amplification | origin requests, logs, queue backlog |

**[Proposed design]** These totals exclude VAT/tax and customer AI inference. The pilot remains honestly inside $50–60; early paid is at the ceiling and must not be promised at launch cost. A location-dependent 20% tax applied only to the $28.19 Hetzner line adds $5.64, making pilot approximately $42.59 and early paid approximately $63.11.

**[Proposed design]** Mandatory launch cost is CPX22/IPv4/backups, measured Neon usage, R2 usage, and recovery/monitoring within allowance. Optional upgrades are Cloudflare Pro ($25 monthly rather than annual pricing), Resend Pro ($20), Better Stack Nano ($30), a second CPX22-class worker (approximately another $28.19 with IPv4/backup), and paid GitHub capacity. They are not included until a cited limit or operational trigger is reached.

**[Proposed design]** Sensitivities, using the early-paid row as the reference:

| Shock | Formula/result | Control |
| --- | --- | --- |
| 10× API/MCP calls | No direct request fee on CPX22, but measurement may force CPX32 or a second API VM; Neon CU-hours and reads can rise non-linearly | Per-token/user/site limits, pagination, query budgets, p95/CPU trigger |
| 10× database egress | 80 GB -> 800 GB; `max(0, 800-500) × $0.10 = $30` extra | Alert at 100 GB, project columns/ranges, cache, reuse fetched rows |
| 10× image delivery | 500 GB -> 5 TB delivery egress remains $0; if 8M monthly B reads became 80M uncached, `(80-10) × $0.36 = $25.20` | CDN cache, immutable URLs, hotlink/rate controls |
| One unusually active tenant | Cap launch default at two concurrent generation jobs per organization and one per site; isolate its usage counters and backlog | Reject/queue above cap; founder-approved quota changes only |
| Stuck/retrying job | Three total attempts makes host work/network at most roughly `3 × one-attempt cost`; then terminal dead state | Lease heartbeat, exponential backoff, idempotency key, retry budget |
| Backup growth | Four weekly exports add approximately `2 × DB GB` R2 storage and `4 × DB GB` Neon transfer; at 75 GB this is 150 GB stored and 300 GB transfer | PITR first, weekly export, lifecycle, measured restore; avoid daily full dumps |

**[Measurement required]** CU-hours, cache-hit-adjusted R2 request classes, row bytes, export compression, and telemetry ingestion are not current observations. Replace model inputs only with dashboard/query evidence, never with a lower unexplained total.

## 10. Recommended service ownership map

**[Proposed design]** Use Hetzner pilot compute: **yes**. One machine for API and workers: **yes**, as separate containers with managed off-box data. Keep PostgreSQL on Neon: **yes**. Moving PostgreSQL to Hetzner adds upgrades, monitoring, WAL/offsite backups, restore drills, standby/failover work, and materially worse RPO/RTO. Use R2 for images. Run post-processing on Hetzner workers; Cloudflare Cron is wakeup only. Only managed edge, R2, email/auth, and optionally Neon compute scale to zero; the VM does not. The VM, IPv4, and VM backups create the fixed floor.

| Workload | Recommended service | Why | Monthly launch cost | Scale trigger | Migration destination |
| --- | --- | --- | ---: | --- | --- |
| Marketing site | Existing Cloudflare Pages project | Preserves private marketing ownership and edge cache | $0 incremental within allowance | Pages/Worker allowance or marketing build limit | Same provider or static object/CDN origin |
| Authenticated web assets | Nginx container on CPX22 behind Cloudflare | Same-origin, immutable assets, no second deployment runtime | included in $28.19 | API host saturation or independent release need | Cloudflare Pages/static bucket while API remains separate |
| Hono API | CPX22 API container | Persistent Bun/Hono process without function-duration ceiling | included | API p95 >500 ms or API-only CPU >70% | second API VM behind load balancer |
| MCP endpoint | Same Hono API container through Cloudflare | Reuses authentication, tenant services, and exact catalog | included | sustained 30 rps or connection isolation need | same second API pool; never separate authority |
| Persistent/background worker | Separate worker container on CPX22 | Long-running jobs and heartbeats; database remains queue | included | worker harms API, host >70%, or backlog >5 min | second worker VM, then horizontal workers |
| Cron trigger | Cloudflare Cron Worker | Thin authenticated wakeup; UTC schedule and no eligibility logic | $0 within Workers Free | trigger/CPU allowance or reliability evidence | Workers Paid; EventBridge Scheduler only with AWS queue adoption |
| PostgreSQL | Neon Launch | Managed storage/PITR/patching; low idle cost | about $8.61 pilot modeled | >2 CU sustained, >70% pooled connections, >$30, or >100 GB warning | larger Neon plan; RDS only for contractual HA/private networking |
| Connection pooling | Neon pooled endpoint plus application pool limits | Existing managed feature; avoids PgBouncer service | included in Neon | >70% published/observed limit or pool wait SLO | dedicated PgBouncer beside API only when measured |
| Image/object storage | Cloudflare R2 Standard | S3-compatible, low storage price, zero delivery egress | about $0.15 pilot modeled | request allowance, storage quota, or recovery limitation | second R2 bucket or S3/Hetzner replica |
| Image delivery/CDN | R2 custom domain through Cloudflare cache | Immutable public delivery and edge abuse controls | $0 egress | origin B requests or hotlink abuse | Cloudflare paid cache controls or alternate CDN |
| Authentication/OAuth | Existing WorkOS AuthKit | Current browser OAuth and MCP grant boundary | $0 within allowance | MAU/enterprise connection requirement | paid WorkOS tier; replacement requires explicit security migration |
| Transactional email | Resend Free | Verification/recovery without operating SMTP | $0 within 3k/month and 100/day | 80% quota, daily cap, or deliverability need | Resend Pro ($20 at cited tier) |
| Secrets | Dokploy/container secret store plus offline password-manager escrow | Fewest dependencies; least-privilege per service | $0 | second host/operator or failed rotation drill | managed secret store/KMS |
| Logs/errors/metrics/uptime | Better Stack Free plus bounded local Docker logs | One service covers errors, logs, probes, and heartbeats | $0 within 3 GB logs and cited limits | 80% ingest, retention/support requirement | Better Stack Nano ($30) or evaluated replacement |
| Database backups | Neon 7-day PITR + weekly encrypted pg_dump to locked R2 prefix | Provider recovery plus portable off-provider-format copy | R2/Neon transfer included in model | exports approach transfer/storage warning or restore misses RTO | longer Neon history and separate-account/cross-provider copy |
| Object recovery | Immutable keys, 30-day R2 prefix lock, lifecycle manifest | Prevents accidental overwrite/delete without versioning assumption | included in R2 | deletion/export policy or compliance need | S3 Versioning/Object Lock or cross-provider replica |
| Container registry | Existing GHCR | Public core images and current release workflow | $0 within GitHub policy | private overlay bandwidth/storage charge | paid GHCR capacity or another OCI registry |
| CI/CD | GitHub Actions in public core/private overlay | Preserves one-way sync, validation, and immutable deploy | $0 incremental within allowance | minutes/storage exceed org allowance | paid GitHub capacity/self-hosted runner after measurement |
| Rate limiting/WAF | Cloudflare Free WAF/coarse IP rule + API in-memory burst and PG quotas | Covers IP plus durable user/site/token/operation dimensions without Redis | $0 | attack volume, rule limitation, or multi-API-host rollout | Cloudflare Pro/Workers rate service; shared limiter when second API added |
| Billing/entitlements later | Server-side Cloud overlay; provider undecided | Financial authority stays outside MCP and web display | $0 at pilot | founder approves packages, tax/refund policy, checkout | selected billing provider with idempotent webhooks |

**[Proposed design]** Published assets use immutable R2 custom-domain URLs. Private/unapproved library assets use an authenticated proxy or short-lived signed access. Use separate prefixes/buckets, but database ownership remains authoritative. Apply a 30-day R2 lock to recoverable user-upload prefixes and lifecycle rules to disposable generated assets.

## 11. Security and reliability

**[Proposed design]** Keep tenant/site-scoped services and integration tests. Use separate application and migration DB credentials, Neon pooling, least-privilege R2 tokens, restricted runtime secrets, existing application credential encryption, a backed-up master key, and a documented rotation procedure.

**[Proposed design]** Cloudflare supplies coarse IP protection; application limits apply by IP, user, site, MCP token, and expensive operation. An in-memory burst limiter is sufficient on one VM; PostgreSQL supplies durable quotas. Do not add Redis. Validate upload type/size at Cloudflare, Nginx, and application boundaries. Do not emit provider credentials, content bodies, prompts, or secrets in logs, MCP results, telemetry, or this report.

**[Proposed design]** Jobs use PostgreSQL leases, heartbeats, capped retries, exponential backoff, stale recovery, dead state, and per-tenant concurrency caps. Pair Neon PITR with weekly encrypted R2 exports and monthly disposable restores; retain Hetzner VM backups and a documented rebuild-from-GHCR procedure. Keep sanitized 30-day operation events, bounded local Docker logs, Better Stack errors/uptime/heartbeats, readiness checks, and spend alerts.

**[Proposed design]** Set the Neon autoscaling maximum to the approved pilot ceiling; alert at 50%, 80%, and 100% of modeled compute, transfer, R2 operations/storage, Better Stack ingestion, Resend mail, and VM traffic. Use provider hard limits where offered and application hard quotas everywhere else; an alert alone is not an abuse control. A Neon PITR recovery creates/restores a branch at the chosen timestamp, validates schema/row counts and application smoke tests on the new endpoint, drains writes, switches the runtime secret, and retains the old branch until acceptance. A portable recovery decrypts the latest export only into a disposable empty PostgreSQL database, restores, validates, and follows the same bounded switch procedure.

**[Proposed design]** Pilot recovery objectives pending founder approval: operational PostgreSQL RPO **at most 15 minutes while the incident remains inside Neon’s 7-day PITR window**; provider-independent portable-export RPO **at most seven days**; replacement-VM RTO **at most four hours**; full database restore RTO **at most eight hours**. The seven-day figure is retention depth, not data-loss granularity. These are proposed objectives, not provider guarantees; PITR granularity and every restore time are **measurement required**.

**[Proposed design]** Recovery gates are operational, not paperwork: monthly restore into a disposable database, quarterly replacement-VM rebuild from the last approved GHCR digest, worker lease recovery after forced termination, and an incident procedure that can return traffic to the last Ready Vercel deployment while Neon remains authoritative. Account deletion must revoke sessions/tokens, cancel runnable jobs, delete scoped rows and private objects after the approved grace period, retain only legally required sanitized audit records, and produce a site-scoped data export before deletion when requested.

## 12. Scaling thresholds

**[Proposed design]** Split a worker to a second VM when worker activity causes API p95 above 500 ms, VM CPU or memory exceeds 70% for 15 minutes, or the oldest runnable job exceeds five minutes twice in a week. Upgrade Neon when compute exceeds two CU sustained, monthly Neon cost exceeds $30, pooled connections exceed 70%, or egress exceeds 100 GB. Add an API VM and load balancer when API-only CPU exceeds 70%, sustained API load exceeds 30 requests/second, or availability no longer tolerates one compute node.

**[Proposed design]** Consider an external wakeup queue only after 100,000 jobs/month, job-claim queries use over 20% of database time, or database-backed claiming misses the backlog SLO. PostgreSQL remains authoritative even then.

## 13. Phased launch

| Phase | Exact outcome | Dependencies | Infrastructure change | Security/reliability gate | Cost ceiling | Acceptance and required evidence | Rollback |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| A — measurements and disposable tests | Baseline memory, CPU, duration, connections, DB transfer, R2 requests, restart, restore, and region latency | Founder selects test regions; disposable credentials/database; current Vercel/Neon remains production | Temporary CPX22 and test R2 prefix only; no DNS or production traffic | No production secrets in shell history/output; least-privilege test tokens; encrypted dump can be restored | $35 for one test month, delete sooner | Section 14 commands recorded with timestamps; peak RSS/CPU, p95 duration, connection peak, bytes, restore RPO/RTO, and restart recovery are no longer unknown | Delete disposable VM/prefix/database; production is untouched |
| B — private pilot infrastructure | Reproducible shadow stack with API and separate worker containers using production Neon and dual-safe R2 access | A passes; data region, RPO/RTO, tax ceiling, signup/quota approvals | Provision one CPX22, VM backups, immutable GHCR deployment, Nginx, Better Stack probes; Cloudflare route remains non-public/shadow | App/migration DB roles separated; scoped R2 token; secret rotation rehearsed; health/readiness/heartbeat; restore test passes | $45/month pre-tax modeled | Exact image digest, configuration inventory without values, tenant-isolation tests, job lease/retry/dead-state tests, backup restore evidence | Stop shadow containers; revoke shadow credentials; Vercel remains sole production path |
| C — production hardening | Shadow topology is deployable, observable, recoverable, and abuse-bounded | B passes; incident owner and on-call contact assigned | Enable authenticated thin cron wakeup, bounded logs, spend alerts, WAF/coarse IP rules, application quotas, backup lifecycle | Upload validation at all three boundaries; rate limits by IP/user/site/token/operation; master-key recovery; forced worker/VM failure tests | $50/month pre-tax | Web/API/MCP/OAuth/R2 smoke suite; 401 Bearer challenge; no secret/content-body telemetry; backlog recovers inside SLO; monthly restore scheduled | Disable cron/worker and proxy route; revert last container digest; no database rollback required |
| D — first customers | Approved private customers use the hybrid path with bounded cutover | C passes; support contacts; deletion/export policy; tenant quotas | Lower DNS/proxy TTL, deploy immutable image, smoke shadow origin, switch Cloudflare origin, drain Vercel connections for a bounded window | Error rate, p95, heartbeat, connection, backlog, and spend dashboards green; no unresolved severity-1 tenant-scope finding | $60/month pre-tax; tax-bearing ceiling requires founder approval | Health 200, MCP 401 challenge unauthenticated, OAuth metadata 200, authenticated site-scope checks, published/private image checks, p95 <500 ms, oldest runnable job <5 min | Immediately point origin/alias to last Ready Vercel deployment; stop Hetzner worker after claims expire; Neon and R2 remain unchanged |
| E — measured scaling | Add capacity only when section 12 thresholds are repeatedly evidenced | D stable for four weeks; per-tenant usage and cost attribution available | First add a worker VM; next add API VM/load balancer; then upgrade Neon; external wakeup queue last | Repeat isolation, idempotency, restore, failover, rate-limit, and spend tests after each topology change | Approved monthly envelope; growth model is $180–230, not launch budget | Threshold evidence for two observation windows, capacity test, new recovery runbook, and rollback rehearsal | Remove new node/service and return claims/traffic to prior topology; PostgreSQL eligibility remains authoritative |

**[Proposed design]** Preserve the one-way merge from public core into the private Cloud overlay throughout. Migration is shadow infrastructure, immutable image deployment, Neon unchanged, dual-safe R2 access, smoke tests, low-TTL cutover, bounded draining, and immediate rollback—not a schema rewrite.

## 14. Disposable experiments

**[Measurement required]** Run these only against disposable or explicitly authorized test resources; do not print credentials. Replace container names with the actual Compose service names and record the commit/image digest beside every result.

```bash
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'
docker inspect --format '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' blogfactory-api blogfactory-worker
psql "$TEST_DATABASE_URL" -X -c "select queryid,calls,rows,total_exec_time,shared_blks_hit,shared_blks_read,temp_blks_read,temp_blks_written from pg_stat_statements order by total_exec_time desc limit 20"
psql "$TEST_DATABASE_URL" -X -c "select usename,state,count(*) from pg_stat_activity where datname=current_database() group by 1,2 order by 1,2"
psql "$TEST_DATABASE_URL" -X -c "select pg_database_size(current_database()) as bytes,pg_size_pretty(pg_database_size(current_database())) as size"
curl -fsS -o /dev/null -w 'connect=%{time_connect} ttfb=%{time_starttransfer} total=%{time_total}\n' "$TEST_ORIGIN/api/health"
time pg_dump --format=custom "$TEST_DATABASE_URL" | age -r "$BACKUP_RECIPIENT" > /tmp/blogfactory-test.dump.age
time age -d -i "$BACKUP_IDENTITY" /tmp/blogfactory-test.dump.age | pg_restore --dbname="$DISPOSABLE_DATABASE_URL" --clean --if-exists
docker kill blogfactory-worker
docker start blogfactory-worker
docker restart blogfactory-api
```

**[Measurement required]** Before and after a fixed replay set, export Neon’s project consumption for compute-hours and public network transfer and Cloudflare R2 Analytics for stored bytes, Class A operations, Class B operations, and egress. The difference divided by completed API calls/jobs/images is the model input; dashboard screenshots or CSV exports are the evidence because PostgreSQL does not expose provider-billed network bytes. Query queue recovery with the repository’s actual status-table names discovered in the schema, recording `count(*)`, oldest eligible timestamp, attempts, lease owner/expiry, and terminal failures before the forced stop, each minute during recovery, and after drain. Do not invent a generic SQL query before confirming those columns.

**[Measurement required]** Region test: run the health `curl` command 100 times from the proposed Cloudflare/Hetzner region and from one customer-representative region; report p50/p95 connection and TTFB. VM test: reboot the disposable host, then record time until health, readiness, and worker heartbeat recover and stale leases are reclaimed. Backup test: record dump bytes, encrypted bytes, transfer bytes, restore duration, row counts, and application smoke results. A result without raw timestamps, region, image digest, and database snapshot identifier is not promotion evidence.

## 15. Founder approvals

| Decision | Proposed default | Why approval is required | Needed before |
| --- | --- | --- | --- |
| Data region | Hetzner EU region nearest the selected Neon EU region; R2 location hint aligned where possible | Determines latency, transfer path, customer representation, and data-location promise | Phase A purchase |
| Pilot RPO/RTO | ≤15-minute operational DB RPO inside PITR window; ≤7-day portable RPO; 4-hour VM and 8-hour DB RTO | Converts backup design into an accepted business risk | Phase B |
| Tax-bearing budget ceiling | $60/month before tax and a separately approved invoice ceiling after VAT | Provider tax depends on billing location; early-paid case can exceed $60 after tax | Phase B |
| Signup and tenant quotas | Invite-only; two concurrent generation jobs per organization, one per site; explicit storage/upload caps | Prevents abuse and isolates one hot tenant | Phase D |
| Retention, deletion, and export | 30-day sanitized audit retention; 30-day recoverable upload lock; documented export and deletion grace period | Changes privacy promises and recovery/deletion trade-offs | Phase C |
| Observability vendor | Better Stack Free, bounded to non-sensitive telemetry | Sends operational metadata to another processor and may require paid retention | Phase B |
| Billing and entitlement packaging | No billing in pilot; later provider selected through separate product/security decision | Prices, taxes, refunds, webhook authority, and packaging are not shipped | Before paid launch |

## 16. Sources and verification

**[Repository evidence]** Final report checks: exactly 22 MCP rows, all listed background workloads, exactly three architecture candidates, and all four scenarios are present. Official source links and the 2026-08-31 access date appear in sections 9 and 16. No API/schema/runtime/application types are changed.

**[Live verified 2026-08-31]** Additional comparison-only official sources, accessed 2026-08-31: [Vercel pricing](https://vercel.com/pricing), [Vercel function limits](https://vercel.com/docs/functions/limitations), [Hetzner Object Storage overview](https://docs.hetzner.com/storage/object-storage/overview/), [Hetzner Object Storage pricing](https://www.hetzner.com/storage/object-storage/), [AWS S3 pricing](https://aws.amazon.com/s3/pricing/), [AWS RDS pricing](https://aws.amazon.com/rds/pricing/), [AWS Frankfurt RDS public price-list JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/eu-central-1/index.json), [RDS backup retention and PITR](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html), [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/), [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/), and [Amazon SQS pricing](https://aws.amazon.com/sqs/pricing/). The price-list inputs used above are $0.019/hour Single-AZ `db.t4g.micro`, $0.037/hour Multi-AZ, and GP3 $0.137/GB-month Single-AZ or $0.274/GB-month Multi-AZ in Frankfurt. They establish published alternatives, not a recommendation to use AWS or an external queue for this pilot.

**[Live verified 2026-08-31]** Source-limit detail: R2 allowances/prices and direct-egress treatment are on [R2 pricing](https://developers.cloudflare.com/r2/pricing/); [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) and [bucket locks](https://developers.cloudflare.com/r2/buckets/object-locks/) support the proposed retention controls; thin cron limits are on [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/); Cloudflare documents [rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/). Neon’s current pricing is [Neon pricing](https://neon.com/pricing), plan/PITR limits are in [Neon plans](https://neon.com/docs/introduction/plans), pooling is documented in [connection pooling](https://neon.com/docs/connect/connection-pooling), and the 500 GB paid-transfer change is [Neon’s official announcement](https://neon.com/blog/more-data-transfer-on-paid-plans). Better Stack’s free plan details are on [its pricing page](https://betterstack.com/pricing), WorkOS’s OAuth/user allowance on [User Management](https://workos.com/user-management), and Resend’s limits on [pricing](https://resend.com/pricing) and [quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits). All were accessed 2026-08-31 and require recheck before purchase.

**[Repository evidence]** Required local verification after this file is written: `git diff --no-index --check /dev/null docs/research/blogfactory-cloud-infrastructure-plan-2026-08-31.md`, then `git diff --check`, then `git status --short`. Any unrelated existing whitespace diagnostic must be reported separately; nothing is staged, committed, pushed, deployed, or provisioned.
