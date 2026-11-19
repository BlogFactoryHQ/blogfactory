# RSS Scheduler

BlogFactory Cloud's persistent worker (`server/src/worker.ts`) starts the RSS
tick every 6 hours and on worker start, plus a daily indexing, Search Console,
and operation-event retention drain. The public repository has no scheduled
production workflows.

Self-hosted installs call one protected cron endpoint from their `scheduler`
container (Compose, Dokploy) or cron service (Railway):

```text
GET /api/cron/drain?task=feeds
Authorization: Bearer $CRON_SECRET
```

Vercel cron is not used. Cloudflare Worker Cron remains a campaign, SEO, and
image fallback every 6 hours.

Cloudflare files:

```text
wrangler.cron.jsonc
cloudflare/cron-worker.ts
```

Required secret:

```text
Cloudflare CRON_SECRET = same value as backend CRON_SECRET
```

Optional variable:

```text
Cloudflare CRON_BASE_URL = https://app.blogfactory.io
```

The app still decides which feeds are due from
`last_run_at + frequency`, so 10 or 1,000 feeds do not require 10 or 1,000 crons.

Runtime safety knobs in backend env:

```text
RSS_CRON_MAX_FEEDS=1
RSS_CRON_MAX_POSTS_PER_FEED=1
RSS_FEED_RUN_LEASE_MINUTES=15
```

The worker and the cron endpoint read the same knobs. Raise them only if runs finish comfortably.

Each feed run is claimed atomically in PostgreSQL before generation starts. Manual
and scheduled runs share the same claim, so only one batch can run for a feed at a
time while feeds with the same source URL remain independent. Claims are released
when their generation jobs settle; the lease duration is a crash-recovery fallback.
