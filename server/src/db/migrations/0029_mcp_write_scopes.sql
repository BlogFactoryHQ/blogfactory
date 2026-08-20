ALTER TABLE mcp_oauth_connections
  DROP CONSTRAINT IF EXISTS mcp_oauth_connections_scopes_check;

ALTER TABLE mcp_oauth_connections
  ADD CONSTRAINT mcp_oauth_connections_scopes_check CHECK (
    scopes @> ARRAY['content:read']::TEXT[]
    AND scopes <@ ARRAY['content:read', 'drafts:write', 'publish:draft']::TEXT[]
  );
