-- Unlimited user-connected sites and active site selection
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  sitemap_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  page_count INTEGER DEFAULT 0,
  vector_count INTEGER DEFAULT 0,
  topics TEXT[],
  language TEXT,
  cta TEXT,
  internal_link_index JSONB,
  internal_link_last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS active_site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);

DO $$ BEGIN
  CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
