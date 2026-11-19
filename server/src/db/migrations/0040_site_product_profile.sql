ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS product_profile JSONB,
  ADD COLUMN IF NOT EXISTS product_profile_updated_at TIMESTAMPTZ;
