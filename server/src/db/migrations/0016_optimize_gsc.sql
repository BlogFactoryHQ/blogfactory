-- Google Search Console data and Optimize analysis
CREATE TABLE IF NOT EXISTS search_console_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  property_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  credentials_encrypted TEXT NOT NULL,
  credential_hint TEXT,
  last_tested_at TIMESTAMPTZ,
  last_test_result TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id)
);

CREATE TABLE IF NOT EXISTS search_console_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  page_url TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, date, page_url, query)
);

CREATE TABLE IF NOT EXISTS optimize_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  target_query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'tracking',
  baseline_metrics JSONB,
  latest_metrics JSONB,
  optimized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, page_url, target_query)
);

CREATE TABLE IF NOT EXISTS optimize_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  target_query TEXT NOT NULL,
  own_content_snapshot JSONB,
  competitor_snapshots JSONB,
  suggestions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_console_integrations_user_site ON search_console_integrations(user_id, site_id);
CREATE INDEX IF NOT EXISTS idx_search_console_metrics_site_page ON search_console_metrics(site_id, page_url);
CREATE INDEX IF NOT EXISTS idx_search_console_metrics_site_query ON search_console_metrics(site_id, query);
CREATE INDEX IF NOT EXISTS idx_optimize_pages_site_status ON optimize_pages(site_id, status);
CREATE INDEX IF NOT EXISTS idx_optimize_analyses_site_page ON optimize_analyses(site_id, page_url);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_search_console_integrations_updated_at'
  ) THEN
    CREATE TRIGGER trg_search_console_integrations_updated_at BEFORE UPDATE ON search_console_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_search_console_metrics_updated_at'
  ) THEN
    CREATE TRIGGER trg_search_console_metrics_updated_at BEFORE UPDATE ON search_console_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_optimize_pages_updated_at'
  ) THEN
    CREATE TRIGGER trg_optimize_pages_updated_at BEFORE UPDATE ON optimize_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
