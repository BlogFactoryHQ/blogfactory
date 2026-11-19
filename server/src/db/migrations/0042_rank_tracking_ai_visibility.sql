ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS ai_visibility JSONB,
  ADD COLUMN IF NOT EXISTS ai_visibility_checked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS rank_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INTEGER,
  ranking_url TEXT,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rank_keywords_site_keyword_idx ON rank_keywords (site_id, keyword);
CREATE INDEX IF NOT EXISTS rank_keywords_due_idx ON rank_keywords (last_checked_at NULLS FIRST);
