# Product-led SEO: gap analysis and plan

Status: proposal (2026-11-04). Not shipped. Competitor facts come from public pages and are unverified unless linked.

## Problem

BlogFactory repurposes RSS/external sources well. It cannot start from "here is my product (e.g. an app URL), find what to write to bring organic traffic". The existing `seo-growth-plan` needs Search Console data, so a new or low-traffic product gets nothing. There is no keyword research, SERP, or competitor data source in the server today.

## What exists (reuse)

- Campaign modes `keyword | title | title_outline | programmatic`, CSV/template programmatic SEO (`programmatic.ts`).
- Knowledge base per site (`knowledge.ts`), brand voice, internal linking with embeddings, Search Console plan, review/draft/CMS push, MCP tools.

## What competitors do that we lack

| Capability | Seen in | We have |
| --- | --- | --- |
| Crawl product URL, build product profile (features, ICP, pains, competitors) | Agent Writer (AGPL), SEO Machine `features.md` | No |
| Keyword research with volume/difficulty/intent | OpenSEO (MIT, DataForSEO), Agent Writer | No |
| Keyword clustering to topical map / pillar+cluster | OpenSEO forks, SEO Machine Keyword Mapper | No |
| Competitor content gap | SEO Machine `/research-gaps` | No |
| SERP-based brief (top-10 headings, PAA, entities) | Byword, Outrank, SEO Machine | No |
| Commercial templates: alternatives, vs, best-of, use-case, integration pages | Outrank, programmatic tools | Partial (programmatic templates) |
| Product-aware writing (natural CTA, real feature claims, no hallucination) | Outrank, SEO Machine | Partial (knowledge base) |
| Human-sounding pass / AI-pattern scrub, 0-100 quality score | SEO Machine `/scrub`, `/optimize` | Partial (optimize.ts) |
| Auto-schedule a 30-day calendar from the topical map | Outrank | Only from GSC |

## Proposed pipeline

1. **Product Profile**: crawl URL (+ optional extra pages), LLM extracts features, audience, problems, competitors, tone. Stored per site, user-editable, feeds knowledge base.
2. **Topic Discovery**: seed keywords from profile, expand via a keyword provider, score by volume, difficulty, intent, product fit.
3. **Topical Map**: cluster into pillar + clusters, tag intent (informational, commercial, alternatives, comparison).
4. **SERP Brief**: per item, fetch top results, extract headings/questions/entities, produce outline.
5. **Generate** with existing pipeline using profile + brief + internal links; product-fit CTA rules.
6. **Calendar**: write plan into the existing campaign items (same table as the GSC plan), review queue, draft push. Draft-only boundary unchanged.

## Data provider options

| Option | Cost shape | Notes |
| --- | --- | --- |
| DataForSEO (BYO key) | pay per request, small | Same provider OpenSEO uses; best data; needs user key or managed key |
| LLM-only + free signals (Google autocomplete, PAA scrape) | ~free | Weaker numbers, no volume; good fallback for self-host |
| Borrow OpenSEO via its MCP | self-host separate service | MIT; extra moving part |

Recommendation: provider interface with DataForSEO first and an autocomplete/LLM fallback, so self-host works without a paid key.

## Phases

- P1: Product Profile + LLM/autocomplete topic discovery + clustering + calendar into campaigns. No paid data needed.
- P2: DataForSEO adapter (volume, difficulty, SERP briefs), competitor gap.
- P3: commercial templates (alternatives/vs/best-of), quality score + scrub pass, refresh loop via GSC once traffic exists.

## Boundaries

MCP stays draft-only. New MCP tools, if any, are read/plan tools and need the existing exact-catalog test update. Every query stays user- and site-scoped. Provider keys follow the existing credential handling and never enter the operation ledger.

## Sources

- [Agent Writer](https://github.com/gregorym/agent-writer) (AGPL-3.0)
- [OpenSEO](https://github.com/every-app/open-seo) (MIT, DataForSEO, MCP)
- [SEO Machine overview](https://pyshine.com/SEO-Machine-AI-Powered-Content-Creation/)
- [Outrank alternatives roundup](https://rightblogger.com/blog/outrank-alternatives) (vendor-style, unverified pricing)

## Addendum: more research (2026-11-04)

Facts below come from each project's own page unless noted. Vendor roundups are unverified.

### Closest open-source references (all self-hosted)

| Project | License | Worth copying |
| --- | --- | --- |
| [BlogPilot](https://github.com/IamRamgarhia/BlogPilot-Open-Source-AI-SEO-Content-Studio) | MIT | No paid API needed: Google autocomplete, People Also Ask tree (3 levels), Bing top-10 for SERP briefs, competitor sitemap cluster scan, content gap from competitor headings, TF-IDF content score vs top-10, duplicate check, cannibalization detector, JSON-LD, llms.txt, content decay, "what to write next" |
| [pages-seo](https://github.com/Benjamin-Bloch/pages-seo) | MIT | URL → "Brand DNA" → 28-day calendar with one pre-titled keyword slot per day, editable grid, daily cron publish |
| [open-seo](https://github.com/every-app/open-seo) / [fork](https://github.com/arturseo-geo/open-seo) | MIT | DataForSEO volume/difficulty, MCP, keyword clustering, LLM mention tracking |
| [Agent Writer](https://github.com/gregorym/agent-writer) | AGPL-3.0 | Keyword discovery from site URL, Ghost/GitHub publish. AGPL matches our license |
| [openSEO (Juliusolsson05)](https://github.com/Juliusolsson05/openSEO) | not checked | Structured block-by-block posts, keyword dictionaries |

### Commercial reference

[Outrank](https://www.outrank.so) (official page): $99/mo shown, 30 articles/month, one article per day from a keyword plan, chat keyword brainstorming with volume/difficulty, 150+ languages, multi-site, backlink exchange, many CMS integrations, 7-day preview before auto-publish. It does not say it plans from a product URL. Byword's page returned no usable text, so its facts stay unverified.

### Free data sources for P1/P2

- Google autocomplete (shipped in P1), People Also Ask and related searches (scrape, fragile, check terms), Bing top-10 for SERP briefs.
- Google Trends gives relative interest only, no volume. No verified official API found.
- Cheap paid SERP APIs exist (e.g. Apify actor from $5/1,000 results, unverified); DataForSEO stays the volume source.

### GEO / AI search

No mature open-source GEO platform found. Small options: Bright Data GEO tracker (vendor), geo-eval CLI. Cheap in-scope wins: llms.txt, FAQ/HowTo JSON-LD, answer-first structure, citation-friendly tables.

### Re-ranked backlog

1. PAA question tree + SERP-brief (Bing top-10 headings) feeding article outlines.
2. Competitor sitemap scan and heading content-gap against the product profile rivals.
3. Cannibalization/duplicate check before a topic is added to the plan.
4. Alternatives / vs / best-of templates wired to profile competitors.
5. Editable product profile UI, "what to write next" ranking, auto-fill the 30-day calendar.
6. Content score vs SERP terms and AI-pattern scrub pass.
7. llms.txt + JSON-LD (FAQ/HowTo) on draft output; later DataForSEO volume.

### Byword, AutoSEO and SEO skills (third-party pages, unverified)

- Byword: bulk keyword-to-article, programmatic templates, voice matching, WordPress/Webflow publish. Its own pages returned no readable text; reviews disagree on price ($99 to $299/mo). No keyword clustering is mentioned anywhere.
- AutoSEO (getautoseo.com, Automated SEO OÜ): about one article a day, WordPress/Shopify publish, backlink network, $149/mo. Reviewers note no rank tracker, no audit, no public API or MCP. Several unrelated products share the name.
- Free SEO skills worth borrowing: [amazing-seo-skill](https://awesome.ecosyste.ms/projects/github.com%2Fmetawhisp%2Famazing-seo-skill) (llms.txt, works without scripts), [seo-skill](https://github.com/aevans-eng/seo-skill) (static meta/JSON-LD/sitemap audit), [claude-seo](https://github.com/agricidaniel/claude-seo) (needs DataForSEO for live data).

### Implemented on this branch (free, no paid API)

- Product profile from the site URL (editable seeds and rivals), autocomplete topic discovery with question and prefix/suffix expansion.
- Cannibalization guard: topics matching existing posts, plan items or indexed pages are flagged and sink in ranking.
- Alternatives / vs / best-of template topics from profile rivals.
- `GET /api/product-seo/posts/:id/analysis`: readability, keyword density and stuffing, structure, stock-AI-phrase detector, near-duplicate (4-gram shingles) against sibling posts.
- `GET /api/product-seo/posts/:id/json-ld`: BlogPosting and FAQPage JSON-LD.
- `GET /api/product-seo/llms-txt`: llms.txt from the indexed pages and published posts; "Copy llms.txt" button in the panel.

- People Also Ask style question tree (two levels of Google autocomplete questions, about 0.8 s, no key).
- SERP brief via the Brave Search API when `BRAVE_SEARCH_API_KEY` is set: reads the top 8 pages with an honest bot user agent, extracts shared headings and median length. Not scraping Bing, Yahoo or Google: a browser-spoofing probe was blocked as bot-check circumvention and was dropped.
- Competitor gap from a public sitemap (robots.txt, sitemap.xml, sitemap index), ranked by product fit, with "already covered" detection.
- MCP 0.5.0, 26 tools: read-only `analyze_post`, `discover_topics`, `research_keyword`, `find_content_gaps` (`content:read`, site-bound).

Not done: UI for per-post analysis, LLM-written outline from the brief, Brave plan limits (not stated on the docs page), DataForSEO volume (P2).
