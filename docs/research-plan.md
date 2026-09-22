# Research Plan — 2026-09-22

> Forward plan. Nothing here is shipped until the matching item is checked in [`FEATURE_PLAN.md`](../FEATURE_PLAN.md) and verified in code. Cloud packaging and prices stay in the private Cloud repository.

## Decision

BlogFactory adds a research layer so a small business can connect its existing site, see what to write about, and get drafts grounded in real search results and cited sources, without RSS feeds and without an expensive keyword-database subscription.

The draft-only boundary does not change. Research makes drafts better and easier to approve; it never publishes.

## Who it is for

Small businesses that **already have a site** on WordPress, Wix, Framer, Ghost, or a custom stack BlogFactory can deliver drafts to:

- small startups and mobile apps with a marketing site;
- local businesses, especially in Turkish and other non-English niches where a few good posts can rank;
- small e-commerce shops with their own site (a marketplace storefront is context, not a destination).

Not in scope: large companies competing on high-volume English keywords, and anyone without a site BlogFactory can deliver drafts to.

## Not building

| Idea | Why not |
|---|---|
| Hosted blogs | A separate product (templates, hosting, moderation of arbitrary content). BlogFactory delivers to the customer's CMS. |
| Autopilot live publishing | Google's scaled content abuse policy targets exactly this pattern, and enforcement has included manual actions and de-indexing since mid-2025. Draft-only is the product promise. |
| Keyword-database gap reports (Ahrefs/Semrush-style) in v1 | Expensive, and near-empty for small sites and small-language niches. Search results and autocomplete show real demand better there. |
| Scraping Instagram or Trendyol | Login-walled or bot-protected (Trendyol returned HTTP 403 to a plain fetch). Customers paste or upload that context instead. |
| Open-ended research agents on the customer's AI key | Unbounded searches and "deep research" models are how a single run reaches tens of dollars. Every research run has a fixed call budget. |

## Competitive frame

- **Byword** (Research, Live Research, Knowledge): per-article search-results research, keyword explorer, competitor gaps, citations. Paid tiers start well above BlogFactory's packaging. Its fact-checking mechanism is undocumented beyond changelog lines.
- **AutoSEO**: "SEO autopilot" — one auto-published article a day plus link exchange, no documented approval queue. Its terms make the customer solely responsible for reviewing content it publishes by default; public reviews report unapproved outbound links and ranking losses.

BlogFactory's position: the research and planning of those tools, with a human yes on every draft, at a small-business price.

## Product flow

```text
connect site (existing)
  → paste links: site, App Store / Google Play page, product list   [R2]
  → business profile auto-filled (existing brand fields)
  → topic plan: 20–30 ranked topics with the reason each one is winnable   [R3]
  → operator accepts topics into the Search Growth plan (existing, dated)
  → each draft generated with a research brief and cited sources   [R1]
  → review on phone or desktop: approve / request changes   [R4]
  → approved draft delivered to the CMS as a draft (existing)
```

## Slices

Build in this order. Each slice ships and is useful on its own.

### R1 — Research brief for each article

The biggest quality gap today: `enableResearch` only adds a prompt sentence, and no live search happens during generation (`generation-contracts.ts`, `generate-content.ts`).

- New `server/src/services/research.ts` runs a **fixed** plan for a topic and locale:
  1. one search-results call for the target query, including People Also Ask;
  2. fetch and extract the top 5 organic pages (reuse `extract-content.ts` HTML extraction);
  3. up to 3 fact searches for statistics or current details.
- Output is a structured `ResearchBrief`: angles covered by ranking pages, common headings, open questions, candidate facts each tied to a source URL and excerpt, and gaps no ranking page covers.
- The generator receives the brief as input to the outline and draft steps. Facts used in the article must reference a brief source; citations render as inline links or a reference list (article setting).
- Store the brief with the job/post so the review packet can show **Sources** next to the draft. Brief content is customer data and never enters the operation ledger.
- Fails open: if research is unavailable, generation continues and the draft is marked "no research".

### R2 — "Paste your links" business profile

- Inputs: site URL (already connected), optional App Store / Google Play listing, optional product list (CSV or pasted text), optional short description.
- Reuse the sitemap crawl in `internal-linking.ts` to read the site's own pages, and `extract-content.ts` for public listing pages.
- One summarization call proposes values for the existing brand fields (`brandCompanyName`, `brandDescription`, `brandTargetAudience`, `brandValueProps`) plus seed topics and the primary locale. The operator edits and saves; nothing is applied silently.
- Product lists go into the existing knowledge documents.

### R3 — Topic plan without Search Console

Search Growth already plans dated work from Search Console data (`seo-growth-plan.ts`, campaign items with planning status). New sites have little or no Search Console data, so the topic plan feeds the same plan from public search data.

- Expand seed topics with Google autocomplete and People Also Ask for the site's locale.
- For each candidate, read the current top 10 and judge how winnable it is: weak results (forums, thin pages, off-topic or outdated pages, marketplace listings) mean an opportunity.
- Score fit to the business profile and search intent; drop topics already covered (reuse the existing duplicate-topic checks against posts and the internal-link index).
- Show a ranked list with the reason for each topic. Accepted topics become Search Growth plan items (`settingsSnapshot.source = "research"`), so dates, stages, and draft creation reuse the existing flow.
- Re-runnable monthly; results are cached (see cost model).

### R4 — Review on the go

- Make the Review Queue and post review usable on a phone: read the draft, see sources and warnings, approve or request changes in a few taps. Approval keeps today's preflight, optimistic locking, and explicit destination rules.
- A daily "drafts waiting for you" email belongs with lifecycle email in the private Cloud repository; the core exposes the digest data it needs.

## Where Jev fits

Jev (TypeSafe's System One model, see the [2026-09-20 fit note](research/jev-system-one-fit-2026-09-20.md)) answers narrow typed questions cheaply and quickly; it cannot write text. In this plan it makes the research **decisions**:

| Decision | Primitive | Slice |
|---|---|---|
| Is this top-10 result weak, adequate, or strong for the query? | `choice` | R3 |
| Search intent: how-to, comparison, buying, local, news | `choice` | R3 |
| Does this topic fit this business? | `score` | R3 |
| Does this source excerpt support this candidate fact? | `choice` (supported / not supported / insufficient) | R1 |
| Does this draft need a fact check before approval? | `noul` | R4 hint |

Rules:

- Runs server-side on the **instance's** TypeSafe key, never the customer's AI key. Pin the model version (for example `jev-1.13.0`).
- R3 decisions only see **public** data (search results and the site's public pages), which avoids the customer-content privacy/DPA gate in the fit note. Decisions over customer drafts (R1 fact support, R4 hint) stay behind that gate and ship shadow-only first.
- Every Jev decision has a deterministic fallback (domain lists for forums and marketplaces, word count, title/heading match, freshness dates), so the feature works when Jev is unavailable, over its limits, or not configured on a self-hosted instance.
- Jev is English-first. A hand-labelled Turkish and English acceptance set for the weak/strong question is required before its scores affect ranking.
- Jev never has authority: it ranks and flags; code and the operator decide.

## Cost model

Unit costs as published in September 2026 (DataForSEO pay-as-you-go, $50 minimum deposit):

| Call | Unit cost |
|---|---|
| Google organic search results, live / standard queue | $0.002 / $0.0006 per query |
| People Also Ask expansion | +$0.00015 per click depth |
| Page fetch and parse | $0.000125 per page |
| Jev input | $0.042 per million tokens, output free |

Budgets per run (fixed call counts, enforced in code):

| Run | Calls | Research data cost | Paid by |
|---|---|---|---|
| R1 brief for one article | 1 search + PAA, 5 pages, ≤3 fact searches | ≈ $0.005–0.03 | instance |
| R1 brief synthesis | 1 call on the customer's cheap model | ≈ $0.002–0.02 | customer key, estimate shown first |
| R2 profile | a few page fetches + 1 summary call | < $0.01 + one model call | instance + customer key |
| R3 topic plan for one site | ~50 queries, autocomplete, PAA, Jev | ≈ $0.10–0.50 | instance |

Controls:

- Search results are public data: cache them by query + locale for 7–30 days and share the cache across tenants. Customer briefs and profiles stay tenant-scoped.
- Hard per-run call caps and a per-account monthly research budget; runs past the budget stop with a clear message rather than degrading silently.
- The customer's key is only used for the synthesis call, with the estimated cost shown before the run.
- Self-hosted instances enable research by setting provider keys in the environment; without them the research UI explains what is missing and generation works as today.

Whether research is included in existing Cloud plans or sold as an add-on is a packaging decision for the private Cloud repository. The unit costs above support including it with monthly limits.

## Provider decision needed

AGENTS.md forbids arbitrary provider access. This plan needs one explicit product and security decision to add two **instance-level** providers, configured by environment, never per user:

1. A search-results provider behind a small adapter so it can be swapped by configuration. Start with Serper.dev: 2,500 free queries with no card, and its search response includes People Also Ask and related searches, with a separate autocomplete endpoint. Page fetching reuses `extract-content.ts`, so it needs no provider. DataForSEO stays a later option if keyword volume or difficulty data becomes necessary; its $50 minimum deposit is not needed for development.
2. TypeSafe (Jev) for decisions, optional, with deterministic fallback. Jev is not available through OpenRouter (checked 2026-09-22), so it needs its own TypeSafe key. Only R3 and the R4 hint use it; R1 does not.

## Guardrails that do not change

- Draft-only delivery, explicit destination, preflight, optimistic locking, idempotency.
- MCP authority does not grow. Exposing briefs or topic plans through MCP is a later, separate decision; any such tool would be read-only.
- The existing daily generation guardrails still apply to research-driven drafts.
- Every query and stored brief is user- and site-scoped.

## Acceptance checks

- R1: 20 English and 20 Turkish topics produce briefs within the call budget; every fact in the resulting drafts links to a brief source; generation succeeds with research disabled or failing.
- R2: profiles for 10 real small-business sites (including app and e-commerce sites) need only light edits.
- R3: on 10 small sites, operators accept at least half of the top 20 topics; Jev and the deterministic fallback are compared on the labelled weak/strong set.
- R4: a draft can be reviewed and approved on a 375px-wide screen without horizontal scrolling.
- Cost: measured provider spend per run stays inside the budgets above.

## Open questions

1. Citation style default: inline links or a reference list?
2. Which locales launch first besides English and Turkish?
3. Should R3 run automatically after site connection, or only when the operator asks?
4. Trendyol seller API import for product lists: worth a later slice?

## Sources

- Byword: [Research](https://byword.ai/features/research/), [docs](https://byword.ai/learn/docs), [pricing](https://byword.ai/pricing)
- AutoSEO: [homepage](https://getautoseo.com/), [terms](https://getautoseo.com/terms-and-conditions), [Trustpilot reviews](https://www.trustpilot.com/review/getautoseo.com)
- Google: [spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- DataForSEO: [pricing](https://dataforseo.com/pricing), [SERP API pricing](https://dataforseo.com/pricing/google-serp/google-organic-serp-api)
- TypeSafe: [Jev announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [models](https://docs.typesafe.ai/models)
