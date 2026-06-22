-- Voice and content controls
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS voice_mode TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS custom_voice_profile JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS voice_training_samples JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS content_rules JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS custom_article_instructions TEXT;
