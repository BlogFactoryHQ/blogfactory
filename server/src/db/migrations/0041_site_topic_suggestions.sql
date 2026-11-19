ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS topic_suggestions JSONB,
  ADD COLUMN IF NOT EXISTS topic_suggestions_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS sites_topic_check_idx ON sites (topic_suggestions_checked_at NULLS FIRST) WHERE product_profile IS NOT NULL;
