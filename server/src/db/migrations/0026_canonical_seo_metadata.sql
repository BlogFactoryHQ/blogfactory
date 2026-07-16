ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS seo_metadata JSONB;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_user_seo_status
  ON posts(user_id, (COALESCE(seo_metadata->>'status', 'missing')));

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_active_seo_metadata
  ON jobs(user_id, source_type, source_value)
  WHERE source_type = 'seo_metadata' AND status IN ('pending', 'running');
