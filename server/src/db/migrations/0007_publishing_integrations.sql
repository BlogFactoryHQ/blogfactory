-- Per-site publishing integrations and publication history
CREATE TABLE IF NOT EXISTS site_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  credentials_encrypted TEXT NOT NULL,
  credential_hint TEXT,
  config JSONB,
  last_tested_at TIMESTAMPTZ,
  last_test_result TEXT,
  last_publish_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES site_integrations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  publish_mode TEXT NOT NULL DEFAULT 'draft',
  status TEXT NOT NULL,
  external_id TEXT,
  external_url TEXT,
  external_edit_url TEXT,
  title TEXT,
  error_message TEXT,
  response_data JSONB,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_integrations_user ON site_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_site_integrations_site ON site_integrations(site_id);
CREATE INDEX IF NOT EXISTS idx_site_integrations_provider ON site_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_post_publications_user ON post_publications(user_id);
CREATE INDEX IF NOT EXISTS idx_post_publications_post ON post_publications(post_id);
CREATE INDEX IF NOT EXISTS idx_post_publications_integration ON post_publications(integration_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_site_integrations_updated_at'
  ) THEN
    CREATE TRIGGER trg_site_integrations_updated_at BEFORE UPDATE ON site_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_post_publications_updated_at'
  ) THEN
    CREATE TRIGGER trg_post_publications_updated_at BEFORE UPDATE ON post_publications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
