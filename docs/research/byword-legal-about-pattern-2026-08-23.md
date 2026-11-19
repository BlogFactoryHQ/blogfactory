# Byword legal and About page pattern

Research date: 2026-08-23

## Scope and limitation

This is a structural comparison, not legal advice and not a substitute for counsel. It uses the publicly rendered first-party pages for [Byword Terms](https://byword.ai/terms-and-conditions/), [Privacy](https://byword.ai/privacy/), and [About](https://byword.ai/about/). Those pages exposed a title and purpose summary to the available public renderer, but no detailed clause or section hierarchy. Do not infer unseen terms from them.

## Observed pattern

| Surface | Visible purpose | Reusable pattern |
| --- | --- | --- |
| Terms | Explains that platform-use terms exist. | Keep software-license terms and any future managed-service terms distinct. |
| Privacy | Explains that a data-handling policy exists. | Use a dedicated, plain-language privacy page with a bounded scope. |
| About | Positions the product around research-backed SEO work for content teams. | Use product positioning rather than an invented company narrative. |

The shared pattern is intentionally compact: a named trust page with one clear job. It is a useful information architecture reference, not text or clause source.

## Truthful BlogFactory mapping now

- **Privacy:** `blogfactory.io/privacy/` already follows the dedicated-page pattern, but its scope is only Cloud-launch updates: email and consent data, stated purpose, Cloudflare/Turnstile/D1 handling, deletion window, and contact path. Keep that narrow label while Cloud is not operating. [Marketing privacy source](../../../blogfactory-marketing/src/pages/privacy.astro)
- **Open-source terms:** point users to the [AGPL-3.0-only license](../../LICENSE) for the software. It is not evidence of a hosted-service agreement.
- **About framing:** a factual page can say BlogFactory is an open-source, self-hosted content-operations control plane where agent work is reviewed and delivery is CMS-draft-only. That matches the [README](../../README.md), [architecture](../architecture.md), and current marketing footer; it must continue to call Cloud “coming soon.”
- **Self-hosted data boundary:** the architecture says community instances run on the installer's infrastructure and their MCP tokens, content, credentials, and operation events do not route through BlogFactory Cloud. Present this as deployment documentation, not a universal privacy guarantee for the operator's chosen AI, CMS, Google, hosting, or email providers. [Architecture](../architecture.md)

## Do not claim yet

The release plan says Cloud pricing, limits, checkout, subscriptions, entitlements, hosted public signup, and Cloud support operations are not implemented. Therefore do not publish managed-service terms, paid-plan promises, an SLA, availability claims, or Cloud data-retention/cancellation promises as if they apply today. [Release plan](../../FEATURE_PLAN.md)

## Facts needed before adding pages

### Terms / service terms

1. Legal entity, registered address, governing law, venue, and effective date.
2. Whether terms cover only the public website, a future Cloud service, or both; and the relationship to the AGPL license.
3. Cloud account, acceptable-use, support, suspension, availability, payment, tax, renewal, cancellation, and liability positions.
4. Which integrations are user-configured, who is responsible for their terms/credentials/content, and any intellectual-property or feedback policy.

### Privacy

1. Controller identity and privacy contact; applicable jurisdictions, lawful bases, rights process, and age policy.
2. Complete production data map: website cookies/analytics, form data, Cloud account data, product content, telemetry/logs, backups, and support records.
3. Actual processors/subprocessors, data locations/transfers, retention/deletion rules, security disclosures, and change-notice process.
4. Verified launch-email sender, unsubscribe, suppression, and consent evidence before sending the promised update.

### About

1. Approved company/owner identity, location, team/founder facts, contact channel, and any claims of history, customer count, funding, or results.
2. The intended audience and a reviewed product-description ceiling that does not overstate the still-unreleased Cloud service.

## Recommendation

Keep the current scoped privacy page. When the owner supplies the facts above and counsel approves them, add two short, separately maintained surfaces: **Terms** for website/Cloud service terms and **About** for verified company and product context. Do not derive legal copy from Byword.

## Sources

- Byword: [Terms](https://byword.ai/terms-and-conditions/), [Privacy](https://byword.ai/privacy/), [About](https://byword.ai/about/) (accessed 2026-08-23).
- BlogFactory: [release plan](../../FEATURE_PLAN.md), [README](../../README.md), [architecture](../architecture.md), [AGPL-3.0-only license](../../LICENSE), [marketing privacy page](../../../blogfactory-marketing/src/pages/privacy.astro), and [marketing footer](../../../blogfactory-marketing/src/layouts/BaseLayout.astro).
