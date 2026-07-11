ALTER TABLE post_publications ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_publications_idempotency_key
  ON post_publications(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_image_generation_requests_import_state
  ON image_generation_requests(user_id, id, status, updated_at);
