# RSS Scheduler

BlogFactory uses one protected cron endpoint:

```text
GET /api/cron/drain?task=feeds
Authorization: Bearer $CRON_SECRET
```

Vercel cron is not used. Frequent ticks are handled by a Cloudflare Worker Cron Trigger:

```text
wrangler.cron.jsonc
cloudflare/cron-worker.ts
```

Required Cloudflare Worker secret:

```text
CRON_SECRET = same value as backend CRON_SECRET
```

Cloudflare Worker variable:

```text
CRON_BASE_URL = https://blogfactory.io
```

The image queue runs every 5 minutes. RSS runs every hour. A full drain runs daily. The app still decides which feeds are due from
`last_run_at + frequency`, so 10 or 1,000 feeds do not require 10 or 1,000 crons.

Runtime safety knobs in backend env:

```text
RSS_CRON_MAX_FEEDS=1
RSS_CRON_MAX_POSTS_PER_FEED=1
IMAGE_CRON_MAX_REQUESTS=2
```

Raise those only if cron runs finish comfortably under the backend function limit.
