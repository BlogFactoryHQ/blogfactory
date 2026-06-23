ALTER TABLE generation_logs
  ADD COLUMN IF NOT EXISTS usage_type TEXT,
  ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generation_logs_post_id ON generation_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_generation_logs_usage_type ON generation_logs(usage_type);
