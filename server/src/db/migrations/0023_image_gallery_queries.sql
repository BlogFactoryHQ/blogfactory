CREATE INDEX IF NOT EXISTS idx_image_assets_user_created
  ON image_assets(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_image_assets_user_status_created
  ON image_assets(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_assets_user_type_created
  ON image_assets(user_id, type, created_at DESC);
