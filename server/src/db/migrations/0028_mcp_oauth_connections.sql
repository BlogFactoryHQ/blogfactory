CREATE TABLE IF NOT EXISTS mcp_oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL CHECK (scopes = ARRAY['content:read']::TEXT[]),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_connections_user_created
  ON mcp_oauth_connections(user_id, created_at DESC);
