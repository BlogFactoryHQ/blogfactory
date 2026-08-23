ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE campaign_items
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS planned_for TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB,
  ADD COLUMN IF NOT EXISTS planning_status TEXT;

CREATE INDEX IF NOT EXISTS idx_campaigns_user_site_mode
  ON campaigns(user_id, site_id, mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_items_plan_date
  ON campaign_items(campaign_id, planned_for, position);
