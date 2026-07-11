ALTER TABLE sites ADD COLUMN IF NOT EXISTS editorial_topics TEXT[];

ALTER TABLE feeds ADD COLUMN IF NOT EXISTS site_id UUID;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS integration_id UUID;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS editorial_defaults JSONB;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS routing_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS site_id UUID;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS feed_id UUID;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS preferred_integration_id UUID;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS site_id UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS feed_id UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS preferred_integration_id UUID;

UPDATE feeds AS feed
SET site_id = (
  SELECT settings.active_site_id
  FROM user_settings AS settings
  WHERE settings.user_id = feed.user_id
    AND settings.site_id IS NULL
    AND settings.active_site_id IS NOT NULL
  LIMIT 1
)
WHERE feed.site_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feeds_site_id_sites_id_fk') THEN
    ALTER TABLE feeds ADD CONSTRAINT feeds_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feeds_integration_id_site_integrations_id_fk') THEN
    ALTER TABLE feeds ADD CONSTRAINT feeds_integration_id_site_integrations_id_fk FOREIGN KEY (integration_id) REFERENCES site_integrations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_site_id_sites_id_fk') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_feed_id_feeds_id_fk') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_feed_id_feeds_id_fk FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_preferred_integration_id_site_integrations_id_fk') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_preferred_integration_id_site_integrations_id_fk FOREIGN KEY (preferred_integration_id) REFERENCES site_integrations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_site_id_sites_id_fk') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_site_id_sites_id_fk FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_feed_id_feeds_id_fk') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_feed_id_feeds_id_fk FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_preferred_integration_id_site_integrations_id_fk') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_preferred_integration_id_site_integrations_id_fk FOREIGN KEY (preferred_integration_id) REFERENCES site_integrations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_feeds_site ON feeds(site_id);
CREATE INDEX IF NOT EXISTS idx_feeds_integration ON feeds(integration_id);
CREATE INDEX IF NOT EXISTS idx_posts_site_feed ON posts(site_id, feed_id);
CREATE INDEX IF NOT EXISTS idx_jobs_site_feed ON jobs(site_id, feed_id);
