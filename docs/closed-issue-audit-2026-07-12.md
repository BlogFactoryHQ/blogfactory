# Closed-Issue Audit — 2026-07-12

> Historical audit record. Its findings and production evidence reflect 2026-07-12 and are not a statement of current release status; see the [documentation index](README.md) for current guides.

This ledger compares every closed issue with its merged PR, current callers, checks, database behavior, and available production evidence. `Incomplete` means the implementation exists but one or more stated acceptance checks were never demonstrated; it does not by itself prove a live failure.

| Issue | Status | Impact and current evidence | Remaining gap |
|---|---|---|---|
| #17 Integration Select imports | Verified | Wix/Framer integration dialogs import the shared Select primitives; component tests and typecheck pass. | None found. |
| #18 Image import callback | Verified | React Query receives mutation variables and tests cover quiet/non-quiet success plus cache invalidation. | None found. |
| #19 Model refresh queries | Verified | Normal query functions no longer receive React Query context as the refresh flag; explicit refresh tests pass. | None found. |
| #20 Feed run claims | Regressed → repaired | Production returned eight `/api/content/generate` 500s because a raw SQL fragment bound a JavaScript `Date`. The shared lease now binds an ISO timestamp and has real PostgreSQL concurrency, expiry, idempotency, and release checks. | Confirm the new CI job and post-deploy feed generation. |
| #21 OpenRouter webhook | Verified after added coverage | Authentication, size/schema limits, attribution, and batching exist. The PostgreSQL check now verifies real foreign-key-safe persistence. | None found. |
| #22 Frontend quality baseline | Verified | Typecheck, lint with documented Fast Refresh warnings, frontend tests, and production build pass. | Strict mode remains intentionally out of scope. |
| #23 Migration ledger | Incomplete → repaired | Checksums, advisory locking, transactions, and baseline protection exist. Production logs showed code deployed before required columns. Production builds now migrate before compiling; PostgreSQL CI verifies fresh and repeat runs. | Confirm the production build applies no unexpected migration. |
| #24 API error contract | Verified for scoped routes | Global JSON errors and shared validators cover the originally listed auth/content/feed/job/post/image/persona/integration routes. | Twenty-two direct JSON reads remain in later settings/admin/programmatic/indexing/search routes; audit separately when touched. |
| #25 Posts/jobs pagination | Incomplete | Both APIs enforce a maximum and run UI filters/sorting server-side with supporting indexes. | Uses offset pages and lacks a representative PostgreSQL query-plan regression check. |
| #26 Image gallery contract | Incomplete | Gallery list/stats are bounded and filtered server-side; frontend cache and selection behavior have focused tests. | Combined-filter and query-plan coverage is parser-level rather than database-backed. |
| #27 SQL analytics | Incomplete | Aggregations run in PostgreSQL and recent calls are bounded without raw trace payloads. | No database-backed parity fixture proves the SQL totals against the previous implementation. |
| #28 Atomic external state | Incomplete | Publishing and image import use claims, transactions, idempotency keys, compensation, and reconciliation states. | The promised failure injection after every external/local boundary and concurrent publish/import tests are not present. No current production failure was found. |
| #29 Repository CI | Verified and extended | Server/web builds, typecheck, lint, frontend tests, and recursive backend self-tests run on pushes/PRs. PostgreSQL integration is now a separate required job. | None found. |
| #30 Shared settings editor | Incomplete | Settings and Brand Voice share site-aware loading, cache updates, serialization, and brand/knowledge mutations. | Both pages still duplicate the large editor surface; this is P2 simplification, not a production repair. |
| #31 Generation boundaries | Verified with Ponytail debt | Pure contracts, output handling, source preparation, and types were extracted while preserving the orchestrator and tests. | Unused compatibility re-exports remain; the refactor added net code and the orchestrator is still large. |
| #49 Legacy feed defaults | Verified | API and frontend normalize missing/partial editorial defaults; regression tests cover legacy shapes. | None found. |
| #51 Runtime API normalization | Verified | Shared collection/object adapters and domain normalizers protect legacy arrays, envelopes, and persisted nested fields. | Continue using the adapters for new API consumers. |

## Additional P0/P1 findings

- API and generation error logging passed raw Drizzle/provider errors to Vercel, including SQL parameters and private content. Logs now retain only error names/codes and explicit non-secret context.
- Saved credentials must be evaluated with the encryption secret that created them. Local and historical JWT candidates do not decrypt the 13 stored credentials. Vercel keeps the dedicated production encryption secret non-exportable, so the deployed API/UI must make the final determination; no records are overwritten.
- Per-user API key lookup remains per-user. Environment variables are not used to mask missing or undecryptable account credentials.

## Ponytail ledger

shrink: repeated image-setting normalizers across Content Creator, Settings, and RSS screens. Reuse one frontend helper when those screens next change. [`web/src/pages`]

shrink: repeated Markdown metadata parsing in publishing, posts, batch import, and publish dialog. Keep one parser after behavior fixtures exist. [`server/src/services/publishing.ts`, `web/src`]

yagni: unused generation-service compatibility re-exports. Delete once downstream imports are confirmed absent. [`server/src/services/generate-content.ts`]

shrink: duplicated Settings/Brand Voice editor markup. Reuse one feature surface when product layout next changes. [`web/src/pages/Settings.tsx`, `web/src/pages/Personas.tsx`]

net: approximately -200 to -350 lines, -0 dependencies possible.
