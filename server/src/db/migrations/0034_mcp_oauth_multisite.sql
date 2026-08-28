ALTER TABLE mcp_oauth_connections
  ADD COLUMN IF NOT EXISTS site_ids UUID[];

UPDATE mcp_oauth_connections
SET site_ids = ARRAY[site_id]
WHERE site_ids IS NULL;

ALTER TABLE mcp_oauth_connections
  ADD CONSTRAINT mcp_oauth_connections_site_ids_check
    CHECK (site_ids IS NULL OR (cardinality(site_ids) > 0 AND array_position(site_ids, NULL) IS NULL));

ALTER TABLE mcp_oauth_connections
  DROP CONSTRAINT IF EXISTS mcp_oauth_connections_site_id_sites_id_fk,
  ALTER COLUMN site_id DROP NOT NULL,
  ADD CONSTRAINT mcp_oauth_connections_site_id_sites_id_fk
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
