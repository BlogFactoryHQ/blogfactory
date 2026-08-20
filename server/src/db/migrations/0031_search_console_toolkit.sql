ALTER TABLE search_console_integrations
  ADD COLUMN IF NOT EXISTS sync_metadata JSONB;

CREATE TABLE IF NOT EXISTS search_console_url_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  result JSONB,
  error_message TEXT,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, url)
);

CREATE TABLE IF NOT EXISTS search_console_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  params JSONB NOT NULL,
  result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_search_console_inspections_site_checked
  ON search_console_url_inspections(site_id, inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_console_query_cache_expiry
  ON search_console_query_cache(expires_at);
