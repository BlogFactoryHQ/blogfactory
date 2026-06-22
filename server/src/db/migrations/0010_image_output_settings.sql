ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS image_placement TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS image_compression_enabled BOOLEAN DEFAULT true;

ALTER TABLE image_assets
  ADD COLUMN IF NOT EXISTS alt_text TEXT;

ALTER TABLE image_generation_requests
  ADD COLUMN IF NOT EXISTS alt_text TEXT;
