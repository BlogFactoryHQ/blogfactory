-- Background indexing progress for semantic internal links
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS internal_link_indexing_state JSONB;
