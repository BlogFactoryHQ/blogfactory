# Low-hanging wins and missing features

Status: proposal (2026-11-04). Everything marked "have" was checked in the current code. Competitor claims come from third-party pages and are unverified. Effort: S under a day, M a few days, L a week or more.

## A. Low-hanging wins (backend exists, wiring or UI is missing)

| # | Win | We already have | Add | Effort |
| --- | --- | --- | --- | --- |
| 1 | Brief becomes the article outline | `campaign_items.outline`, campaign mode `title_outline`, `/create?targetQuery=` handoff from the plan | Store the SERP brief and question tree on the plan item and prefill the outline, target length and FAQ list | S |
| 2 | Product pages feed the writer | Per-site knowledge base with chunking and retrieval (`knowledge.ts`), product crawl already reads 1 to 4 pages | Save crawled pages as knowledge documents so drafts use real features and pricing instead of guesses | S |
| 3 | CTA from the profile | `sites.cta` field and article settings | Suggest a CTA and rival-safe positioning line from the profile | S |
| 4 | Quality panel on every draft | `evaluateSeoQa` score (shown only on the Jobs page), new `analyze_post` and JSON-LD endpoints | Show QA score, readability, stuffing, duplicates and flags on the post preview and Review Queue; add the new checks to the QA contract | S |
| 5 | Fill my month | `planDates`, `nextOpenPlanDate`, `addTopicsToPlan` | One button: pick the top non-overlapping topic per cluster and schedule 12 | S |
| 6 | Template pages from the profile | 7 built-in programmatic templates, CSV and dataset materialization | New templates: alternatives, vs, use-case, integration; auto-build the dataset from profile rivals and features | M |
| 7 | Agent playbook | 26 MCP tools | A documented prompt/skill: discover, research, generate, analyze, update, push draft. No code | S |
| 8 | JSON-LD into the CMS draft | JSON-LD builder, Ghost/WordPress/Wix/Framer publishers | Ghost first (supports per-post code injection); others need a plugin or field decision | M |
| 9 | Scheduled topic refresh | Six-hour bounded scheduler and operation ledger | Weekly re-discovery that adds a digest item when new uncovered topics appear | M |
| 10 | Refresh with questions | GSC optimize flow with competitor snapshots (`analyzeOptimizePage`) | Feed missing questions and gap topics into refresh suggestions | M |
| 11 | Better cannibalization | Embedding link index (needs an OpenAI key), title similarity today | Use embeddings when a key exists, titles otherwise | M |

## B. Features a tool in this category normally has and we do not

| Feature | Why it matters | Free or cheap path | Effort |
| --- | --- | --- | --- |
| Real keyword volume and difficulty | Our score is a proxy; Outrank sells volume/difficulty chat | DataForSEO adapter (pay per request) behind the existing provider seam | M |
| Rank tracking before traffic | Search Console shows nothing for a new site | Scheduled position checks through the Brave key (uses quota), later GSC | M |
| Technical audit | Missing meta, canonicals, broken links, sitemap health | Reuse the sitemap crawler; BlogPilot ships 28 rules as a reference | M |
| Multi-language and hreflang | Sites have a language, but no translate-and-link flow; Outrank advertises 150+ languages | Translate drafts with the user's model, emit hreflang, `<slug>-<lang>` per the slug rule | L |
| AI-search (GEO) visibility check | No mature open-source option found | Ask a search-enabled model through the existing OpenRouter key and record mentions and citations; unverified feasibility | M |
| Content score vs top results | Surfer-style term coverage | The SERP brief already downloads top pages; add term frequency comparison | M |
| Pillar and cluster map | Clusters are computed but not stored | Persist `cluster` and `pillar` on plan items, show a tree | M |
| Social and newsletter repurposing | BlogPilot ships it | LLM prompts on an approved draft | S |
| Read-only share link for reviewers | Clients and teammates review without an account | Signed expiring link to the existing review packet | M |

## C. Deliberately not doing

- Auto-publish: the product boundary stops at CMS drafts after approval.
- Backlink exchange networks (Outrank, AutoSEO sell them): off-boundary and risky for site owners.
- Scraping Bing, Yahoo or Google result pages: blocked as bot-check circumvention; use an official API.

## Done on this branch

- Win 1: researching a keyword and choosing "Plan with this brief" stores the outline, target length and FAQ questions on the plan item (`evidence.brief`, `outline`). "Create draft" prefills the outline and length; anything already typed wins. `research_keyword` also returns `plan_brief`.
- Win 2: "Analyze product" saves the crawled pages and profile as a per-site knowledge document (`source: product_profile`, replaced on every re-analysis, user documents untouched). The knowledge base stays off until the user clicks "Use them in drafts".
- Win 4: the post editor has a collapsible Quality check (existing SEO QA score and checks, readability, keyword density, structure, stock phrases, near-duplicates). The keyword comes from the plan item when the draft was created from one. It analyzes the saved version.
- Win 5: "Fill my month" schedules up to 12 topics, one per cluster, none that overlap existing content, with guides capped at half so buying-intent topics make it in.

- Win 3: the profile now suggests a CTA (label and one sentence from site facts). "Use as site CTA" puts it first in the site's brand CTAs, which publishing appends.
- Win 6: new built-in templates (alternatives, use case, integration) and "Build datasets" in the panel, which creates ready rows for alternatives, versus and use-case pages from the profile's rivals, problems and audience. Integration pages need a user-supplied list.
- Win 7: [agent-playbook.md](agent-playbook.md).
- Win 8: Ghost drafts get FAQPage JSON-LD in `codeinjection_head` when the article has at least two real Q&As. WordPress, Wix and Framer are not covered.
- Win 9: weekly background topic check with a "Check now" button; the result is stored on the site and never writes to the plan.
- Win 10: page refresh analysis adds one suggestion listing questions searchers ask that the page does not answer. Gap topics are not fed in because refresh has no competitor domain.
- Win 11: when the user has an OpenAI key and indexed pages carry vectors, topics are also compared by embedding (threshold 0.6, not yet calibrated on real data); otherwise the title check stays.

Not done from section A: none.

Section B, cheap items done:

- Content score vs top results: keyword research now lists terms most top pages share (`brief.terms`), and the editor's Quality check has "Compare with top results", which shows the share of those terms the draft covers and which are missing. Needs `BRAVE_SEARCH_API_KEY`; one search plus up to eight page reads per keyword, cached 12 hours, run on click only. Terms are unigrams and adjacent word pairs with simple stemming; it is not a TF-IDF model against a corpus.
- Pillar and cluster map: a "Topical map" panel on the Plan sheet groups planned topics into clusters computed on read (the shortest term is the pillar). Nothing new is stored, so it follows the plan as it changes.
- Social and newsletter repurposing: the editor's Repurpose panel builds an X thread, a LinkedIn post and a newsletter blurb from the saved text, deterministically (section headings and first sentences), with the published link when there is one. No AI call, so no cost, but also no rewriting.

More section B items done:

- Real keyword volume: optional DataForSEO adapter (`DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`). When set, topic discovery replaces the autocomplete demand proxy with log-scaled monthly volume (one request per run, up to 60 keywords, cached a day; keywords with no data keep their old score), shows a Volume column, and keyword research shows volume and ad competition. Endpoint and response shape follow the DataForSEO docs; per-request price is not stated there. Location codes for en, tr, de, fr, es and it should be confirmed against the DataForSEO location list before relying on them. Not exercised against the live API.
- Rank tracking: track up to 25 keywords per site (or "Track plan keywords"); a Brave Search call per keyword finds the site's first position in the top 20, with a 12-point history and change arrows. Weekly background pass (bounded) plus "Check now". Needs `BRAVE_SEARCH_API_KEY`.
- Technical audit: crawls up to 25 sitemap pages and flags missing or badly sized titles and descriptions, H1 problems, noindex, missing canonical, images without alt, viewport, lang, Open Graph, thin content, structured data, duplicate titles and descriptions, robots.txt blocking and missing sitemap. No broken-link or page-speed checks.
- AI search visibility: asks a web-search model (via the OpenRouter key, `google/gemini-3.5-flash` with the web plugin) up to five buyer questions, then records whether the answer mentions the brand, cites the site, or names rivals. Costs tokens plus a search fee per question (OpenRouter lists Exa search at $0.007 per request by default), so it runs on click only and the last result is stored on the site (migration 0042).

Skipped on purpose, needs a product and security decision first:

- Reviewer share links: a public, unauthenticated page with draft content needs token design, expiry, revocation and an audit trail, and it widens the control-plane boundary in AGENTS.md.
- Multi-language and hreflang: needs a decision on how translated drafts are stored and linked, the `<slug>-<lang>` convention across CMS targets, and who approves each language.

## Suggested order

1. Wins 1, 2, 4, 5 (all S, make the new research actually change drafts).
2. Win 7 (no code) and 6 (templates, the Byword-style bulk answer).
3. DataForSEO adapter, then rank tracking.

## Verification (2026-11-04)

Run on a disposable PostgreSQL with all 45 migrations: `DATABASE_URL=<disposable> POSTGRES_INTEGRATION_ALLOW_WRITES=1 npm run test:postgres:product-seo` (about 7 seconds; also passes on a non-fresh database).

Exercised for real: migrations 0040 to 0042, every `/api/product-seo` route through Hono with tenant isolation, MCP tool handlers, the operation ledger (no credentials in it), live Google autocomplete, live crawls of example.com (profile and audit), a live public sitemap (plausible.io) for the competitor gap, and the private-address guard (localhost, 127.0.0.1, 169.254.169.254, 10.x, ::1). The UI was clicked through in a browser against a local API: analyze product, edit seeds, find topics, fill my month, topical map, technical audit, keyword research, plan with brief, create page prefill, editor Quality check and Repurpose.

Stubbed at the fetch boundary, so request shape and parsing are checked but not the provider itself: Brave Search (headers, query, caching, rank positions), DataForSEO (Basic auth, body, location code, null volumes), OpenRouter with the web plugin (BYO key path), OpenAI embeddings.

Not verified: any real Brave, DataForSEO, OpenRouter or OpenAI response; Managed AI credit reservation for the AI visibility check; Ghost accepting `codeinjection_head`; the 0.6 embedding threshold on real vectors; DataForSEO location codes; a real browser run of the Compare with top results, rank tracker, AI visibility and datasets buttons with live providers.

Bugs the run found and fixed: covered topics fell off the 40-topic list instead of sinking; the overlap threshold flagged one-word variants as duplicates (now 0.7); "Fill my month" scheduled only one topic per cluster (now up to three); the topical map did not refresh after plan changes; question suggestions returned only "how" questions for long keywords because autocomplete answers shortened phrases (now also queries the keyword without its last word, with families capped at three); manual and weekly rank and topic checks used `ASC` ordering, which sorts never-checked rows last, so they could starve; embeddings calls had no timeout.
