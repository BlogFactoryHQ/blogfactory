-- Manual subscription-backed image generation queue
CREATE TABLE IF NOT EXISTS image_generation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  prompt TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cover',
  position INTEGER,
  aspect_ratio TEXT,
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  imported_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_generation_requests_user ON image_generation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_image_generation_requests_post ON image_generation_requests(post_id);
CREATE INDEX IF NOT EXISTS idx_image_generation_requests_status ON image_generation_requests(status);

DO $$ BEGIN
  CREATE TRIGGER trg_image_generation_requests_updated_at BEFORE UPDATE ON image_generation_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
