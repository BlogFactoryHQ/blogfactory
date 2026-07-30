CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 100),
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL CHECK (
    cardinality(scopes) > 0
    AND array_position(scopes, NULL) IS NULL
    AND 'content:read' = ANY(scopes)
    AND scopes <@ ARRAY['content:read', 'drafts:write', 'publish:draft']::TEXT[]
  ),
  site_ids UUID[] NOT NULL CHECK (cardinality(site_ids) > 0 AND array_position(site_ids, NULL) IS NULL),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_user_created
  ON mcp_access_tokens(user_id, created_at DESC);
