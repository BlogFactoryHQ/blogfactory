CREATE INDEX IF NOT EXISTS idx_generation_logs_user_created
  ON generation_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_logs_user_type_created
  ON generation_logs(user_id, usage_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_generation_requests_user_created
  ON image_generation_requests(user_id, created_at DESC);
