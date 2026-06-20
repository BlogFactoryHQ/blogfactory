-- Internal linking sitemap index and rules
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_sitemap_url TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_status TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_mode TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_density TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_include_patterns TEXT[];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_exclude_patterns TEXT[];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_rules JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_index JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_last_synced_at TIMESTAMPTZ;
