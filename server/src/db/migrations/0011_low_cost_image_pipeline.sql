ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS image_source_mode TEXT DEFAULT 'stock_first',
  ADD COLUMN IF NOT EXISTS source_image_allowed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_fallback_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_ai_images_per_day INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS max_ai_images_per_post INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_minutes_between_ai_images INTEGER DEFAULT 5;

ALTER TABLE image_assets
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS credit TEXT,
  ADD COLUMN IF NOT EXISTS license_label TEXT,
  ADD COLUMN IF NOT EXISTS attribution_url TEXT,
  ADD COLUMN IF NOT EXISTS source_kind TEXT;

ALTER TABLE image_generation_requests
  ADD COLUMN IF NOT EXISTS model_id TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS credit TEXT,
  ADD COLUMN IF NOT EXISTS license_label TEXT,
  ADD COLUMN IF NOT EXISTS attribution_url TEXT;

ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS pexels_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS pexels_key_last4 TEXT,
  ADD COLUMN IF NOT EXISTS pixabay_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS pixabay_key_last4 TEXT;
