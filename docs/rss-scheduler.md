# RSS Scheduler

BlogFactory uses one protected cron endpoint:

```text
GET /api/cron/drain?task=feeds
Authorization: Bearer $CRON_SECRET
```

Vercel Hobby can only run daily cron jobs, so frequent ticks are handled by
GitHub Actions:

```text
.github/workflows/rss-cron.yml   # hourly feed drain
.github/workflows/image-cron.yml # every 5 minutes image queue drain
```

Required GitHub secret:

```text
BLOGFACTORY_CRON_SECRET = same value as Vercel CRON_SECRET
```

Optional GitHub variable:

```text
BLOGFACTORY_CRON_URL = https://blogfactory.io/api/cron/drain?task=feeds
BLOGFACTORY_IMAGE_CRON_URL = https://blogfactory.io/api/cron/drain?task=images
```

The RSS action runs every hour. The image action runs every 5 minutes. The app still decides which feeds are due from
`last_run_at + frequency`, so 10 or 1,000 feeds do not require 10 or 1,000 crons.

Runtime safety knobs in Vercel env:

```text
RSS_CRON_MAX_FEEDS=1
RSS_CRON_MAX_POSTS_PER_FEED=1
IMAGE_CRON_MAX_REQUESTS=2
```

Raise those only if cron runs finish comfortably under Vercel's function limit.

Other free tick providers can call the same URL/header:

- cron-job.org
- Cloudflare Worker Cron Trigger
- UptimeRobot-style monitor
