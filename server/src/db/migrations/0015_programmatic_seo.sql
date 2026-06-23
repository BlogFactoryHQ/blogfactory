-- Programmatic SEO templates, datasets, and row variables
CREATE TABLE IF NOT EXISTS programmatic_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  template JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS programmatic_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  columns TEXT[] NOT NULL,
  rows JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE campaign_items ADD COLUMN IF NOT EXISTS variables JSONB;

CREATE INDEX IF NOT EXISTS idx_programmatic_templates_user_created ON programmatic_templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_programmatic_datasets_user_created ON programmatic_datasets(user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_programmatic_templates_updated_at'
  ) THEN
    CREATE TRIGGER trg_programmatic_templates_updated_at BEFORE UPDATE ON programmatic_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_programmatic_datasets_updated_at'
  ) THEN
    CREATE TRIGGER trg_programmatic_datasets_updated_at BEFORE UPDATE ON programmatic_datasets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
