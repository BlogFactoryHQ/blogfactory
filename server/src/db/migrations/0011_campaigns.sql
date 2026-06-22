-- Campaign batch generation
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  outline_mode TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'draft',
  model_id TEXT NOT NULL,
  persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  settings_snapshot JSONB NOT NULL,
  shared_outline JSONB,
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  total_cost REAL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  input TEXT NOT NULL,
  keyword TEXT,
  title TEXT,
  outline JSONB,
  status TEXT NOT NULL DEFAULT 'queued',
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS campaign_item_id UUID REFERENCES campaign_items(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS campaign_item_id UUID REFERENCES campaign_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_user_created ON campaigns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign_position ON campaign_items(campaign_id, position);
CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign_status ON campaign_items(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_jobs_campaign ON jobs(campaign_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campaigns_updated_at'
  ) THEN
    CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campaign_items_updated_at'
  ) THEN
    CREATE TRIGGER trg_campaign_items_updated_at BEFORE UPDATE ON campaign_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
