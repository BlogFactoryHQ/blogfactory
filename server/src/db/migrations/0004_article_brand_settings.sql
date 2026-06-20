-- Working article defaults and brand profile settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS article_word_count INTEGER;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS article_language TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS article_voice TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS include_table_of_contents BOOLEAN;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS enable_research BOOLEAN;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS enable_internal_links BOOLEAN;

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brand_company_name TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brand_description TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brand_target_audience TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brand_mentions TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brand_value_props JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brand_ctas JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS knowledge_base_enabled BOOLEAN;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS knowledge_documents JSONB;
