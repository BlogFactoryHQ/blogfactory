ALTER TABLE image_generation_requests
  ADD COLUMN IF NOT EXISTS fallback_policy TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS completed_via TEXT;

UPDATE image_generation_requests
SET fallback_policy = CASE WHEN type = 'cover' THEN 'none' ELSE 'stock' END
WHERE fallback_policy IS NULL;

CREATE INDEX IF NOT EXISTS idx_image_generation_requests_fallback_policy
  ON image_generation_requests(fallback_policy);
