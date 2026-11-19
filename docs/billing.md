# Cloud billing and Managed AI runbook

BlogFactory PostgreSQL is the authority for plans, quotas, and spendable AI credits. Polar is the merchant-of-record payment and subscription provider; a checkout redirect is never proof of payment. Billing has no MCP tools and never expands the draft-only CMS authority ceiling.

## Catalog

| SKU | Price | Limits |
| --- | ---: | --- |
| `cloud_monthly` | $5/month | 3 sites, 1 GB, 1 generation, 3 active RSS feeds, 150 successful drafts per UTC month |
| `cloud_yearly` | $49/year | Cloud limits; draft quota still resets monthly |
| `advanced_monthly` | $15/month | 10 sites, 10 GB, 3 concurrent generations, 20 active RSS feeds, unlimited manual and 600 automated drafts per UTC month |
| `advanced_yearly` | $149/year | Advanced limits; automation quota still resets monthly |
| `ai_credits_14000` | $20 once | 14,000 prepaid credits, expiring after 365 days |

One thousand credits represent approximately one US dollar of reported provider cost. Plans include no Managed AI credits. Users may bring an OpenRouter key or buy top-ups. `auto` uses a valid BYO key first; `byo` and `managed` lock the choice.

## Environment and flags

Keep sandbox and production values separate. Put secrets only in the ignored local env file or the Hetzner deployment secret store. Dokploy is optional tooling for operating the host, not part of BlogFactory's customer-facing self-host product.

```dotenv
BLOGFACTORY_CLOUD=true
CLOUD_PUBLIC_SIGNUP=false
CLOUD_BILLING_ENFORCEMENT=false
MANAGED_AI_ENABLED=false
POLAR_SERVER=sandbox
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
POLAR_PRODUCT_CLOUD_MONTHLY=
POLAR_PRODUCT_CLOUD_YEARLY=
POLAR_PRODUCT_ADVANCED_MONTHLY=
POLAR_PRODUCT_ADVANCED_YEARLY=
POLAR_PRODUCT_AI_CREDITS_14000=
CLOUD_PUBLIC_LAUNCH_AT=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
AUTH_RATE_LIMIT_SECRET=
OPENROUTER_MANAGED_API_KEY=
WORKOS_API_KEY=
WORKOS_CLIENT_ID=
WORKOS_COOKIE_PASSWORD=
WORKOS_REDIRECT_URI=https://app.blogfactory.io/api/auth/workos/callback
WORKOS_AUTHKIT_ISSUER=https://YOUR-SUBDOMAIN.authkit.app
MCP_RESOURCE_URL=https://blogfactory.io/mcp
```

Deploy migrations and code with all three launch flags false. Enable Managed AI only after the catalog readiness check passes. Enable entitlement enforcement and public signup together only after sandbox and production acceptance.

Immediately before public launch, set the immutable UTC `CLOUD_PUBLIC_LAUNCH_AT` timestamp and run `npm run billing:grant-transition` once. It idempotently grants existing users Advanced-equivalent transition access through launch plus 60 days and never overwrites a Polar or administrator entitlement.

Hosted Cloud is WorkOS-only for sign-in, signup, email verification, password reset, MFA, and session revocation; it never falls back to local password JWTs when WorkOS is unavailable or misconfigured. Readiness fails until browser AuthKit and MCP OAuth variables are complete. Sessions are sealed in an HttpOnly cookie; WorkOS access and refresh tokens are never stored in browser JavaScript. Existing local users can be imported idempotently with `npm run auth:migrate-workos` before signup opens. Community/self-hosted authentication is unchanged. WorkOS sends the authentication emails, so Resend is not required for this launch path.

## Catalog provisioning

Create a minimum-scope Polar organization token with product read/write and checkout/customer-session permissions, then run `npm run billing:catalog`. The script finds exact products by metadata SKU, interval, currency, and integer price. A changed price creates a new product instead of mutating the old contract. Copy the five printed product IDs to the secret store; never expose the access token in Git, logs, issues, or chat. Create or reconcile the production webhook and store its signing secret in the ignored root `.env` with `npm run billing:webhook`.

Configure Polar to send Standard Webhooks to `https://app.blogfactory.io/api/webhooks/polar`. The endpoint verifies the signature with the official Hono adapter, stores only normalized identifiers/status/amounts, deduplicates `webhook-id`, and returns after the durable inbox write. The persistent worker processes the inbox; the six-hour maintenance scheduler reclaims stale inbox claims, expires reservations and credits, and reconciles customer and provider-cost state.

## Runtime rules

- `active` and cancel-at-period-end `canceled` retain access through the paid period.
- `past_due` receives 72 hours from Polar's provider timestamp; afterward writes stop while reads, export, and billing remain.
- `revoked` and refunded subscription periods stop new mutations immediately.
- A successful draft is one committed new post row. Failed calls and retries that create no row do not consume draft quota.
- Manual web/plugin actions are manual. RSS, campaigns, batches, scheduler, and MCP are automated; clients cannot choose the classification.
- Managed calls reserve a live-price upper estimate with 20% headroom. Actual provider cost settles as `ceil(cost_usd * 1000)`. Unknown cost remains reserved for reconciliation.
- Grants spend earliest-expiring credits first. Only unused credit from a purchase is refundable within 14 days; support applies the exact partial Polar refund. Chargeback reversal may create wallet debt and blocks only Managed AI.

## Acceptance

If Polar sandbox is deliberately skipped, do not weaken the checks: deploy with all launch flags false, provision the production catalog, then use an internal account and real low-value purchase/refund to prove all four plans, exactly-once 14,000-credit top-up, duplicate/out-of-order delivery, portal cancel/uncancel, 72-hour grace, partial refund, chargeback debt, redirect-without-webhook denial, reconciliation, and concurrent quota/credit safety before public traffic.

Production additionally requires Polar's written AUP acceptance for AI content generation, OpenRouter's written confirmation for this managed feature, human legal review, and one real low-value purchase/refund. Marketing must remain “coming soon” until live checkout, portal, webhook, and entitlement readback all pass.
