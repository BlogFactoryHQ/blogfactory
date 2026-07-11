ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS publishing_metadata JSONB;
