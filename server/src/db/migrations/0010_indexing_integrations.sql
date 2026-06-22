-- Per-site search indexing integrations and submission history
CREATE TABLE IF NOT EXISTS indexing_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  auto_submit BOOLEAN NOT NULL DEFAULT true,
  credentials_encrypted TEXT NOT NULL,
  credential_hint TEXT,
  config JSONB,
  last_tested_at TIMESTAMPTZ,
  last_test_result TEXT,
  last_submit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES indexing_integrations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL,
  error_message TEXT,
  response_data JSONB,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indexing_integrations_user ON indexing_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_indexing_integrations_site ON indexing_integrations(site_id);
CREATE INDEX IF NOT EXISTS idx_indexing_integrations_provider ON indexing_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_indexing_submissions_user ON indexing_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_indexing_submissions_site ON indexing_submissions(site_id);
CREATE INDEX IF NOT EXISTS idx_indexing_submissions_integration ON indexing_submissions(integration_id);
CREATE INDEX IF NOT EXISTS idx_indexing_submissions_created ON indexing_submissions(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_indexing_integrations_updated_at'
  ) THEN
    CREATE TRIGGER trg_indexing_integrations_updated_at BEFORE UPDATE ON indexing_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_indexing_submissions_updated_at'
  ) THEN
    CREATE TRIGGER trg_indexing_submissions_updated_at BEFORE UPDATE ON indexing_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
