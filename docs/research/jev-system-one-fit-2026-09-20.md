# Jev / System One fit for BlogFactory — 2026-09-20

**Decision:** do not integrate Jev into the normal generation path yet. It is a credible candidate for a small, server-side **shadow evaluation** pilot on already-created drafts, but it cannot generate an article, replace deterministic checks, or authorize any action. This is research only; no application code was changed.

## What Jev actually is

Jev is TypeSafe AI's hosted "System One" decision model. An application sends a text/JSON `state` and a map of predeclared, typed questions; it receives one typed answer per question. It does **not** produce free-form prose. The available question primitives are:

| Primitive | Output | Appropriate BlogFactory shape |
| --- | --- | --- |
| `noul` | probability from 0 to 1 that a proposition is true | "Does this excerpt make a claim that needs a source check?" |
| `choice` | one closed-set option, its full distribution, and confidence | normal review / fact-check / rewrite-needed |
| `score` | a rubric-level score, distribution, and confidence | weak / adequate / strong topical fit |

TypeSafe explicitly recommends one narrow judgment per question and composition in ordinary code; its own API docs describe the endpoint as `POST https://api.typesafe.ai/v1/systemone`. [Introduction](https://docs.typesafe.ai/introduction) · [Primitives](https://docs.typesafe.ai/primitives) · [HTTP API](https://docs.typesafe.ai/api)

This differs from BlogFactory's current OpenRouter-backed generator: `generateContent` writes Markdown drafts, then applies generation contracts and deterministic SEO QA; the content route starts a job and returns `202` rather than waiting for it. [Generation service](../../server/src/services/generate-content.ts) · [Output contracts](../../server/src/services/generation-output.ts) · [Content route](../../server/src/routes/content.ts). Jev belongs after that output exists, as a bounded classifier/scorer, not before or instead of it.

## Delivery, integration, and maturity facts

- **Hosted external service.** The documented endpoint is bearer-authenticated and needs a TypeSafe account/API key. The current TypeScript package is `@typesafe-ai/sdk`, requires Node 20+, and deliberately refuses browser execution by default because that would expose the key. BlogFactory's Bun/Hono server is the correct call site; neither the web app nor an MCP client should call TypeSafe directly. [Quick start](https://docs.typesafe.ai/introduction/quickstart) · [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript) · [SDK server-only guard](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/v0.6.0/src/client.ts)
- **Model and limits as documented on 2026-09-20.** `jev-1.13.0` costs $0.042/M input tokens, has 64k request context (32k for state plus longest question), text-only input, and published limits of 250k tokens/second and 1,200 requests/minute. The provider says those limits can change without notice; pin the version for a pilot, because `jev-latest` can move. [Models](https://docs.typesafe.ai/models)
- **Failure handling.** The API documents `401`, `422`, `429`, and `529`; `429`/`529` require exponential backoff. The SDK has retries, but a BlogFactory pilot should have a short timeout, one bounded retry policy, and a fail-open result of `unavailable` because this evaluator must never block draft creation or review. [API errors](https://docs.typesafe.ai/api) · [SDK retry implementation](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/v0.6.0/src/client.ts)
- **Maturity.** TypeSafe announced Jev on 2026-09-15 as *early access*. Its model page says limits are dynamically adjusting, and the current jaggedness document says Jev 1.13 is not perfect and lists literal reading, context distraction, adversarial-content, numerical, date, and multi-hop-reasoning limitations. Treat vendor performance claims as vendor claims until BlogFactory measures its own corpus. [Announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev) · [Model jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **Licensing and data.** The TypeScript SDK is MIT, but that does not license Jev's hosted weights/service; use of the service is governed by TypeSafe's customer terms. TypeSafe says it does not train or fine-tune on submitted Input, but its privacy policy says it collects prompts/data/instructions, retains personal data as reasonably necessary, and hosts services in the US. Its docs say zero-data-retention is enterprise-only. A DPA, residency review, and an approved provider relationship are prerequisites for sending customer draft content. [SDK license](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/v0.6.0/LICENSE) · [Legal overview](https://docs.typesafe.ai/legal) · [Privacy policy](https://typesafe.ai/legal/privacy-policy)
- **Language.** English is the primary training language; TypeSafe says other languages are not equally well supported and must be tested on the application's own content. BlogFactory's Turkish use cases therefore make a Turkish acceptance set mandatory rather than an afterthought. [Models: language support](https://docs.typesafe.ai/models)

## Good BlogFactory uses

These are advisory, post-generation decisions. Every action remains governed by existing deterministic rules, human review, optimistic locking, and draft-only delivery.

1. **Review-queue triage.** Given the generated Markdown plus its source/topic, select `normal_review`, `fact_check`, or `rewrite_needed`; suppress the suggestion below a conservatively measured confidence. This can help order work without changing editorial state.
2. **Claim/citation review hints.** For each already-extracted candidate claim and supplied source excerpt, choose `supported`, `not_supported`, or `insufficient_evidence`. Candidate extraction remains in code or an existing generative model; Jev chooses among bounded options. This follows TypeSafe's own citation-checking pattern, but cannot establish truth absent source evidence. [Citation checking cookbook](https://docs.typesafe.ai/cookbooks/citation_check)
3. **Semantic relevance ranking.** Score a short list of candidate internal links or source passages after the existing lexical/embedding shortlist. It can rank a constrained candidate set, but should not invent URLs or replace the repository's deterministic duplicate/link logic.
4. **Content safety/quality escalation.** Classify whether a draft needs a specialist or human check (for example, medical/legal/financial advice, personal data, unsupported claims, or prompt injection in imported source text). The result is a review flag only; it must not silently delete, rewrite, or publish anything.

## What not to use it for

- **Article, title, outline, metadata, image prompt, or repair generation.** Jev is explicitly not trained for text generation; TypeSafe says forcing generation through chained choices is slow and poor. Continue using the existing configured text model for prose. [Jev jaggedness: generation](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **Counts, dates, arithmetic, quotas, idempotency, permissions, tenant/site checks, or CMS preflight.** These are exact code/database responsibilities, and TypeSafe explicitly says to keep arithmetic/date comparison in code. [Jev jaggedness: math and dates](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **A publish, update, or routing authority.** BlogFactory's MCP contract remains site-scoped and draft-only; its existing `review_post`, `update_draft`, and `push_to_cms_draft` flow keeps explicit approval and version checks. Jev must not receive MCP authority, create an MCP tool, or bypass the shared `ReviewPacket`/preflight service. [MCP guide](../mcp.md) · [Architecture](../architecture.md)
- **A general evaluator over raw, unbounded content.** Jev's own docs warn that irrelevant large state reduces accuracy and adversarial state can steer answers. Retrieve/filter first; do not send provider credentials, tokens, CMS payloads, source URLs with secrets, or full operation traces. [Jev jaggedness: state and adversarial content](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

## Smallest viable pilot

Run a **server-only, shadow-only draft-review experiment** behind an instance environment flag, using a TypeSafe-managed account key held only in deployment secrets. Do not add a Settings provider, MCP tool, UI surface, credential table column, migration, or new queue for the first pilot.

1. Trigger once only after the existing generator has created a draft and deterministic contracts/SEO QA have run. Keep `generate_draft` success independent of the evaluator: unavailable, malformed, timeout, or low-confidence output is recorded as `unavailable` and never changes the draft/job outcome.
2. Build a compact, site-scoped state from the owned `post` and resolved `siteId`: title, bounded Markdown/excerpt, generation contract/QA result, topic, and a small source-evidence excerpt. Query the post through the existing `userId` + `siteId` ownership path first. Omit credentials, raw provider responses, MCP token data, and unrelated workspace material. Cap it below the documented state budget.
3. Pin `jev-1.13.0`. Make one call with three or four independent closed questions, for example: review disposition (`normal_review`/`fact_check`/`rewrite_needed`), source-to-draft topical fit (three descriptive levels), evidence sufficiency (`noul`), and sensitive-topic escalation (`noul`). Do not derive numerical policies from `Score`; use explicit code thresholds only after measurement.
4. Persist only a small, user/site-scoped evaluation record or safe fields attached to the existing draft/job: model version, question-set version, choices/probabilities/confidence, latency, input-token count, and error class. Never put Markdown state, prompts, source excerpts, or raw provider response into the 30-day operation ledger; BlogFactory's ledger expressly forbids that category of data. [MCP audit boundary](../mcp.md) · [Current generation log schema](../../server/src/db/schema.ts)
5. Show it, if at all, as **"experimental review hint"** in the existing review packet/page—not as a status or a blocker. Reviewers retain all current control. Keep it invisible from MCP until the web flow, privacy review, and calibration are proven.

### Pilot acceptance gate

Before enabling any reviewer-visible hint, evaluate a frozen, consented corpus split by English and Turkish plus source type. Hand-label the four narrow questions, include prompt-injection and ambiguous cases, record model version/question-set version, and compare its flags with editorial outcomes. Set thresholds from false-positive/false-negative cost, not from TypeSafe's generic confidence examples. Launch only if it saves meaningful reviewer time without hiding required review; otherwise remove the flag and keep the deterministic pipeline.

## Recommendation

**Explore it as a reversible evaluation dependency, not as a core generation provider.** The smallest useful experiment is post-generation, shadow-only, server-side, site-scoped, and advisory. It preserves BlogFactory's existing draft-only MCP boundary because Jev has no authority over content writes or CMS delivery. Skip the pilot entirely until the privacy/DPA and Turkish-corpus gates are satisfied.

## Primary sources

- TypeSafe AI: [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- TypeSafe AI: [Documentation index](https://docs.typesafe.ai/llms.txt), [API reference](https://docs.typesafe.ai/api), [Models](https://docs.typesafe.ai/models), [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- TypeSafe AI: [JavaScript SDK docs](https://docs.typesafe.ai/sdk/javascript), [MIT SDK license](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/v0.6.0/LICENSE), [SDK source at v0.6.0](https://github.com/typesafe-ai/typesafe-sdk-js/tree/v0.6.0)
- TypeSafe AI: [Legal](https://docs.typesafe.ai/legal), [Privacy policy](https://typesafe.ai/legal/privacy-policy), [Terms of use](https://typesafe.ai/legal/terms)
