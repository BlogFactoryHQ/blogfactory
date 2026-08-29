# RSS Scheduler

BlogFactory uses one protected cron endpoint:

```text
GET /api/cron/drain?task=feeds
Authorization: Bearer $CRON_SECRET
```

Vercel cron is not used.

```text
Cloudflare Worker Cron: campaign, SEO, and image fallback every 6 hours
GitHub Actions: RSS every 6 hours, full background drain daily
```

Cloudflare files:

```text
wrangler.cron.jsonc
cloudflare/cron-worker.ts
```

GitHub files:

```text
.github/workflows/rss-cron.yml
.github/workflows/full-cron.yml
.github/workflows/campaign-cron.yml
```

Required secrets:

```text
Cloudflare CRON_SECRET = same value as backend CRON_SECRET
GitHub BLOGFACTORY_CRON_SECRET = same value as backend CRON_SECRET
```

Optional variables:

```text
Cloudflare CRON_BASE_URL = https://app.blogfactory.io
GitHub BLOGFACTORY_BASE_URL = https://app.blogfactory.io
```

The app still decides which feeds are due from
`last_run_at + frequency`, so 10 or 1,000 feeds do not require 10 or 1,000 crons.

Runtime safety knobs in backend env:

```text
RSS_CRON_MAX_FEEDS=1
RSS_CRON_MAX_POSTS_PER_FEED=1
RSS_FEED_RUN_LEASE_MINUTES=15
```

Raise those only if cron runs finish comfortably under the backend function limit.

Each feed run is claimed atomically in PostgreSQL before generation starts. Manual
and scheduled runs share the same claim, so only one batch can run for a feed at a
time while feeds with the same source URL remain independent. Claims are released
when their generation jobs settle; the lease duration is a crash-recovery fallback.
