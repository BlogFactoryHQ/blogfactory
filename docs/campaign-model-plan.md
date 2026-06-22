# Campaign Model Plan

Campaign, ayni marka sesi ve ayarlarla 5-100 arasi benzersiz makaleyi toplu ureten ust modeldir. Batch Import degil: Batch Import hazir markdown alir; Campaign inputtan makale uretir, ilerlemeyi izler, hatali itemlari retry eder ve uretilen postlari tek kampanya altinda yonetir.

## Hedef

1. Kullanici keyword, title veya title+outline listesi girer.
2. Sistem her satiri bir campaign item olarak saklar.
3. Her item mevcut `generateContent` hattini kullanarak draft post uretir.
4. Kampanya seviyesi ortak ayarlar tek noktadan gelir: persona, model, brand settings, article settings, image settings, language, custom instructions.
5. UI kampanyayi tek is gibi gosterir ama item bazinda status, post, hata ve retry verir.

## MVP siniri

Ilk surumde sunlar olsun:

- Input modes: `keyword`, `title`, `title_outline`.
- Outline modes: `none`, `shared`, `per_item`.
- Concurrency: default 3, hard max 5.
- Status: `draft`, `queued`, `running`, `completed`, `failed`, `stopped`.
- Item retry: sadece failed item.
- Stop: yeni item baslatmaz, running item bittiginde kampanya durur.
- Posts ekraninda campaign filtresi.
- Campaign detail ekraninda item listesi, progress, retry failed, bulk publish.

Ilk surumde sunlar olmasin:

- Programmatic SEO template/CSV variable engine.
- Keyword research dashboard entegrasyonu.
- AI ile otomatik kampanya fikri uretimi.
- Cok kiracili global queue servisi.

## Veri modeli

Yeni tablolar:

```ts
campaigns {
  id uuid pk
  user_id uuid references users(id) on delete cascade
  name text not null
  mode text not null                 // keyword | title | title_outline
  outline_mode text not null default 'none'
  status text not null default 'draft'
  model_id text not null
  persona_id uuid references personas(id) on delete set null
  settings_snapshot jsonb not null   // brand/article/image/custom ayarlar
  shared_outline jsonb               // [{ level: 2, text }, { level: 3, text }]
  total_items int not null default 0
  completed_items int not null default 0
  failed_items int not null default 0
  total_cost real
  error_message text
  started_at timestamptz
  completed_at timestamptz
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
}

campaign_items {
  id uuid pk
  campaign_id uuid references campaigns(id) on delete cascade
  user_id uuid references users(id) on delete cascade
  position int not null
  input text not null                // original line
  keyword text
  title text
  outline jsonb
  status text not null default 'queued'
  job_id uuid references jobs(id) on delete set null
  post_id uuid references posts(id) on delete set null
  error_message text
  started_at timestamptz
  completed_at timestamptz
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
}
```

Mevcut tablolara eklenecek alanlar:

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS campaign_item_id UUID REFERENCES campaign_items(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS campaign_item_id UUID REFERENCES campaign_items(id) ON DELETE SET NULL;
```

Indexler:

```sql
CREATE INDEX IF NOT EXISTS idx_campaigns_user_created ON campaigns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign_position ON campaign_items(campaign_id, position);
CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign_status ON campaign_items(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_jobs_campaign ON jobs(campaign_id);
```

## Settings snapshot

Campaign basladiginda ayarlar dondurulur. Kullanici kampanya calisirken Settings veya Brand Voice degistirse bile devam eden itemlar ayni kalite/sesle gider.

`settings_snapshot` minimum:

```ts
{
  article: {
    wordCount?: number;
    language?: string;
    voice?: string;
    includeTableOfContents?: boolean;
    enableResearch?: boolean;
    customInstructions?: string;
  },
  brand: {
    companyName?: string;
    description?: string;
    targetAudience?: string;
    mentions?: string;
    valueProps?: unknown[];
    ctas?: unknown[];
    knowledgeBaseEnabled?: boolean;
    knowledgeDocuments?: unknown[];
  },
  images: {
    generateImages: boolean;
    imageConfig?: unknown;
    imageModel?: string;
    stylePrompt?: string;
  },
  internalLinks: {
    enabled?: boolean;
    density?: string;
    rules?: unknown[];
    index?: unknown;
  }
}
```

## Input parsing

Use one parser function, no parser framework.

- `keyword`: non-empty line => `{ keyword: line }`.
- `title`: non-empty line => `{ title: line }`.
- `title_outline`: split each line by tab if tab exists, else semicolon.
- `H3:` prefix means level 3; everything else is level 2.
- Shared outline applies to every item unless item has its own outline.
- Max 100 items in MVP; reject more with 400.
- Blank lines are ignored; duplicate non-empty lines are preserved because users may intentionally target variants.

Parser self-check:

```ts
if (import.meta.main) {
  assert(parseCampaignLines("A; Intro; H3:Details", "title_outline")[0].outline[1].level === 3);
}
```

## Generation strategy

Do not build a second article generator. Add a small internal adapter around existing `generateContent`.

Needed change to `generateContent`:

- accept optional `campaignId`, `campaignItemId`.
- accept optional `settingsSnapshot`.
- accept optional `campaignArticle`:

```ts
{
  mode: "keyword" | "title" | "title_outline";
  keyword?: string;
  title?: string;
  outline?: Array<{ level: 2 | 3; text: string }>;
  sharedContext?: string;
}
```

Prompt mapping:

- Keyword mode: `Write an SEO article targeting this keyword: ...`
- Title mode: `Write an article with this exact title: ...`
- Outline mode: include exact title and required H2/H3 structure.
- Shared campaign context goes into system/user prompt once per item.

Post insert must set:

- `sourceType = "campaign"`
- `sourceRefId = campaign.id`
- `campaignId`
- `campaignItemId`
- `jobId`
- `personaId`
- `modelId`

## Runner

Add `server/src/services/campaign-runner.ts`.

Core loop:

```ts
const CAMPAIGN_CONCURRENCY = 3;

export async function runCampaign(campaignId: string) {
  mark campaign running;
  while campaign is running {
    take up to 3 queued campaign_items;
    if none, finalize campaign;
    await Promise.allSettled(items.map(runCampaignItem));
    recompute counters from campaign_items;
  }
}
```

This is intentionally simple. If Vercel/serverless kills long requests, the next step is not a queue library; it is a resumable runner endpoint/cron that picks queued campaign items. Same tables support that.

Important: current `jobs` route marks `running` jobs older than 2 minutes as failed. Campaign items can run longer. Change stale logic to either:

- ignore jobs with `campaign_id IS NOT NULL`, or
- use 60 minutes for campaign jobs.

MVP pick: ignore campaign jobs in stale cleanup and let campaign item status own timeout/retry.

## API

Add `server/src/routes/campaigns.ts` and mount `/api/campaigns`.

Endpoints:

```txt
GET    /campaigns
POST   /campaigns
GET    /campaigns/:id
POST   /campaigns/:id/start
POST   /campaigns/:id/stop
POST   /campaigns/:id/retry-failed
POST   /campaigns/:id/items/:itemId/retry
DELETE /campaigns/:id
```

Create payload:

```ts
{
  name: string;
  mode: "keyword" | "title" | "title_outline";
  outlineMode?: "none" | "shared" | "per_item";
  lines: string;
  sharedOutline?: Array<{ level: 2 | 3; text: string }>;
  personaId?: string | null;
  modelId: string;
  customInstructions?: string;
  generateImages?: boolean;
  imageConfig?: unknown;
}
```

Response shape:

```ts
{
  campaign: Campaign;
  items: CampaignItem[];
}
```

Authorization rule: every query filters by `userId`. Item endpoints must join through campaign or check both `campaign.userId` and `item.userId`.

## UI

Routes:

- `/campaigns`
- `/campaigns/new`
- `/campaigns/:id`

Sidebar:

- Add `Campaigns` near `Content Creator`.

New campaign screen:

- Name input.
- Mode segmented control: Keyword, Title, Title + Outline.
- Textarea for lines.
- Shared outline builder only in Title + Outline + Shared Outline.
- Persona select, model select, article/image options reused from Content Creator.
- Preview table before start: position, title/keyword, outline count, validation.
- Primary action: Create Campaign.
- Secondary action after create: Start Campaign.

Campaign detail:

- Header: name, status, progress, cost, started/completed time.
- Progress bar: completed / total.
- Item table: position, input/title, status, post link, job link, error, retry button.
- Actions: Stop, Retry Failed, Bulk Publish Completed.

Posts page:

- Add campaign filter.
- Add campaign name column only if campaign data exists, or show it in source cell.

Jobs page:

- Show campaign name/item position for campaign jobs.
- Do not rely on Jobs as the primary campaign UI.

## Status rules

Campaign status:

- `draft`: created but not started.
- `queued`: start requested, no item running yet.
- `running`: at least one running item or queued items remain.
- `completed`: all items completed.
- `failed`: no queued/running items and at least one failed item.
- `stopped`: user stopped before all items completed.

Item status:

- `queued`: waiting.
- `running`: generation started.
- `completed`: post created.
- `failed`: generation failed.
- `stopped`: campaign stopped before item started.

Counter source of truth: derive from `campaign_items`, then copy totals onto `campaigns` for cheap list rendering.

## Cost and budget

Keep existing `generation_logs` as the source of truth. Campaign list uses:

- `campaigns.total_cost` copied from child jobs after each batch.
- `generation_logs.session_id = job.id` remains unchanged.

Budget check stays in `generateContent`. If budget pauses mid-campaign:

- current item fails with budget error.
- runner marks remaining queued items `stopped`.
- campaign becomes `stopped` with `error_message = "Monthly budget exceeded"`.

## Retry

Retry item:

1. Verify item belongs to user.
2. Reset item to `queued`, clear `job_id`, `post_id`, `error_message`.
3. If campaign is `failed` or `completed`, set campaign to `running`.
4. Run only that item, not the whole campaign.

Retry failed:

- Same reset for all failed items.
- Start runner.

Never duplicate completed posts on retry.

## Migration order

1. Add `campaigns` and `campaign_items`.
2. Add nullable campaign columns to `posts` and `jobs`.
3. Add indexes.
4. Update `schema.ts`.
5. Add route mount in `server/src/index.ts`.

## Implementation phases

Phase 1, backend model:

- migration
- schema
- parser service with one self-check
- campaign routes create/list/detail/delete

Phase 2, backend run:

- `campaign-runner.ts`
- `generateContent` adapter fields
- stop/retry endpoints
- stale job cleanup adjustment

Phase 3, UI:

- Campaigns list
- New Campaign
- Campaign detail
- sidebar/App route

Phase 4, polish:

- Posts campaign filter
- Jobs campaign context
- bulk publish from campaign detail
- cost/progress display

## Acceptance checks

Manual happy path:

1. Create keyword campaign with 3 lines.
2. Start campaign.
3. See 3 campaign items complete.
4. See 3 draft posts with `source_type = campaign`.
5. Filter posts by campaign.

Manual retry path:

1. Force one item to fail with bad model/key.
2. Restore setting.
3. Retry only failed item.
4. Completed items are not duplicated.

Manual stop path:

1. Start 10-item campaign.
2. Stop campaign.
3. Running items may finish; queued items do not start.

Small runnable check:

- Parser self-check for keyword/title/title_outline.
- Campaign counter function self-check: mixed statuses produce correct campaign status.

## Product note

Campaign is for related but unique articles. Programmatic SEO is a different product: template + variables + very high volume. Keep that boundary or the model becomes a junk drawer.
