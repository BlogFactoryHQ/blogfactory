-- BlogFactory: consolidated initial migration

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users ──
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── personas ──
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_model TEXT NOT NULL DEFAULT 'openai/gpt-4o',
  system_prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  language TEXT,
  category TEXT,
  response_format TEXT,
  response_schema JSONB,
  tools_config JSONB,
  parallel_tool_calls BOOLEAN,
  tool_choice TEXT,
  plugins_config JSONB,
  validation_rules JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── jobs ──
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_value TEXT NOT NULL,
  model_id TEXT NOT NULL,
  persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  generation_error TEXT,
  generation_plan JSONB,
  result_post_ids TEXT[],
  summary_result TEXT,
  summary_completed_at TIMESTAMPTZ,
  token_cost REAL,
  total_cost REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ── posts ──
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  source_type TEXT NOT NULL,
  source_ref_id TEXT,
  source_content_hash TEXT,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  model_id TEXT NOT NULL,
  cover_image_url TEXT,
  inline_images TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── feeds ──
CREATE TABLE IF NOT EXISTS feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_url TEXT,
  platform TEXT NOT NULL DEFAULT 'rss',
  platform_config JSONB,
  model_id TEXT NOT NULL DEFAULT 'openai/gpt-4o',
  persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL DEFAULT 'daily',
  filter_type TEXT NOT NULL DEFAULT 'none',
  filter_value REAL,
  filter_old_posts_days INTEGER,
  keywords TEXT[],
  posts_per_run INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_continue BOOLEAN NOT NULL DEFAULT false,
  blur_nsfw BOOLEAN NOT NULL DEFAULT false,
  include_content BOOLEAN NOT NULL DEFAULT true,
  include_summary BOOLEAN NOT NULL DEFAULT false,
  include_comments INTEGER,
  extract_full_content BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMPTZ,
  total_articles INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── generation_logs ──
CREATE TABLE IF NOT EXISTS generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id TEXT,
  provider TEXT,
  status TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost REAL,
  latency_ms INTEGER,
  trace_id TEXT,
  session_id TEXT,
  raw_trace JSONB,
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── image_assets ──
CREATE TABLE IF NOT EXISTS image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cover',
  status TEXT NOT NULL DEFAULT 'used',
  prompt TEXT,
  model_id TEXT,
  provider TEXT,
  aspect_ratio TEXT,
  resolution TEXT,
  position INTEGER,
  cost REAL,
  file_size_bytes INTEGER,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── user_settings ──
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  image_model TEXT,
  image_style_prompt TEXT,
  image_advanced_options JSONB,
  cover_enabled BOOLEAN,
  cover_image_count INTEGER,
  cover_resolution TEXT,
  cover_aspect_ratio TEXT,
  inline_enabled BOOLEAN,
  inline_count INTEGER,
  inline_resolution TEXT,
  inline_aspect_ratio TEXT,
  monthly_budget REAL,
  budget_paused BOOLEAN,
  budget_alert_threshold REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── scheduler_logs ──
CREATE TABLE IF NOT EXISTS scheduler_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feeds_checked INTEGER NOT NULL DEFAULT 0,
  feeds_triggered INTEGER NOT NULL DEFAULT 0,
  feeds_skipped INTEGER NOT NULL DEFAULT 0,
  feeds_errored INTEGER NOT NULL DEFAULT 0,
  results JSONB,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── indexes ──
CREATE INDEX IF NOT EXISTS idx_feeds_user ON feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_feeds_active ON feeds(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_job ON posts(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_logs_user ON generation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_logs_created ON generation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_image_assets_user ON image_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_post ON image_assets(post_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_job ON image_assets(job_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_user ON scheduler_logs(user_id);

-- ── updated_at trigger function ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── attach triggers ──
DO $$ BEGIN
  CREATE TRIGGER trg_feeds_updated_at BEFORE UPDATE ON feeds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_personas_updated_at BEFORE UPDATE ON personas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
