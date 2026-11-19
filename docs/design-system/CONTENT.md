# Content — how BlogFactory writes

The words are part of the design system. The reader is an operator running content for one or more sites: busy, technical, and accountable for what reaches a CMS in their name. Write like an operator briefing another operator.

## Voice

- **Short, factual, present tense.** No marketing cadence, no exclamation marks, no emoji anywhere in the product.
- **Name the object, then its state.** "3 drafts waiting on review", not "You have some drafts!".
- **You is the operator; the system is BlogFactory.** "BlogFactory sent 4 drafts to WordPress" — never "we".
- **The operator's words, not the backend's.** "Destination", "run", "draft" — not `integration_id`, `job`, `result_post_ids`.
- **Say it once.** A title is not repeated by its tab; a button is not explained by the sentence beside it.

## Capitalisation

- **Sentence case everywhere**: "Generate draft", "Clear filters", "Brand voice note".
- **Product places keep their capitals** as proper names: Overview, Create Content, Review Queue, Runs, Search Growth, Sources, Content, Control, MCP Connections, Integrations, Sites, Brand Voice, Article Settings, Usage, Growth Plan, Image Gallery, Getting started.
- **Uppercase is a style**: kickers, table heads and badges are written in sentence case and set uppercase by CSS.
- **Acronyms stay acronyms**: MCP, CMS, RSS, SEO, URL, CSV, API.

## Terms (one word per thing)

| Use | Not | Meaning |
|---|---|---|
| Content | Library | the inventory of posts and images (`/library` is only a URL) |
| post | article (in UI), entry | one piece of content in BlogFactory |
| draft | pending post | a post not yet approved, or a CMS draft |
| CMS draft | publish | what an approved post becomes in the destination — never live |
| run | job, task | one generation, with its state and log |
| source | feed (generic), input | where runs come from: RSS, campaign, batch import, brief |
| destination | integration (as a target), endpoint | the CMS a draft is sent to |
| site | workspace (for a domain), property | a connected domain |
| workspace | account, org | everything an operator controls |
| Review Queue | inbox, approvals | the list of real decisions waiting |
| brand voice / persona | tone preset | how a site's posts should sound |
| preflight | checks, validation | what must pass before a draft is sent |
| RSS sources | Content Sources, feeds (as a title) | the RSS tab's list of sources |
| Reporting mode | News | feeds in a news editorial mode |
| Templates | Template Library | programmatic templates |

## Patterns of sentences

| Situation | Formula | Example |
|---|---|---|
| Button | Verb + object | "Generate draft", "Add feed", "Send to CMS draft" |
| Primary create | Verb + thing | "Start run", "Create campaign" |
| Search placeholder | "Search <things>…" | "Search posts…" |
| Loading | a skeleton; words only for long work | "Writing · run 2f81c" |
| Load failed | "Could not load <thing>" + what is safe + Retry | "Could not load runs. Nothing was lost." |
| Empty (first time) | "No <things> yet" + what creates one | "No sources yet — connect an RSS feed to start." |
| Empty (filtered) | "No <things> match these filters" + the total | "218 posts exist in this workspace." |
| Blocked | the missing thing + where to fix it | "Pick a CMS destination before this draft can be sent." |
| Confirm destructive | question naming the thing + consequence; confirm repeats the verb | "Delete this source? … The 38 drafts it already made stay in Content." → "Delete source" |
| Success | past tense, once, in a toast | "Draft sent to WordPress" |
| Helper line | one sentence | "Paste any format — it is normalised before saving." |

Titles, buttons, tabs and labels have no full stop; descriptions and errors do.

## Source types

Never show a raw `source_type`. `formatSourceType()` (`web/src/lib/source-labels.ts`) is the one mapping: rss/rss_feed → RSS, url → URL, pdf → PDF, paste/raw_text → Text, youtube → YouTube, reddit → Reddit, hackernews → Hacker News, github → GitHub, brief → Brief, campaign → Campaign, batch_import → Batch import, mcp_batch_import → MCP batch import; anything new is sentence-cased. So a line reads "RSS · In review · Revision 1", not "rss · in_review".

## Numbers, dates, money

- Counts with the noun: "7 items · 2 blockers". Middle dots separate facts in a line.
- Relative time in meta lines ("updated 4m ago"), absolute in details and charts ("Sep 23 18:49").
- Numbers in tables are `type-data`, right-aligned, with thousands separators.
- Money is the AI provider's cost in USD ("$312 / $450"); it is never a BlogFactory plan price.
- A projection says it is one: "projected $374".

## Agent (MCP) content

- **Say who wrote it.** A draft carries its provenance: the run, the source, the client that made it.
- **Agents propose; people approve.** Copy never implies an agent published anything; the furthest an agent goes is "sent as a CMS draft".
- **State limits plainly.** "Read-only scope — this client cannot write drafts."

## Checklist for a new screen's copy

1. Every place name matches the sidebar and the tables above; "Library" appears nowhere.
2. Buttons are verbs naming their object; there is one primary.
3. Loading, empty, filtered, error and blocked states use the formulas above.
4. Nothing repeats the title, a tab or a button.
5. No exclamation marks, no emoji, no "we".
