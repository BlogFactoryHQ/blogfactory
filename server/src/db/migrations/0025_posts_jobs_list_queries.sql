CREATE INDEX IF NOT EXISTS idx_posts_user_created
  ON posts(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_status_created
  ON posts(user_id, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_source_created
  ON posts(user_id, source_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON jobs(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user_status_created
  ON jobs(user_id, status, created_at DESC, id DESC);
