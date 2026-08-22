CREATE TABLE IF NOT EXISTS operation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  origin TEXT NOT NULL CHECK (origin IN ('web', 'mcp', 'system')),
  connection_id UUID,
  client_name TEXT,
  action TEXT NOT NULL,
  object_type TEXT,
  object_id UUID,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  duration_ms INTEGER,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_operation_events_user_created
  ON operation_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_events_user_site_created
  ON operation_events(user_id, site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_events_expires
  ON operation_events(expires_at);

CREATE OR REPLACE FUNCTION record_job_operation_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.status IN ('running', 'completed', 'failed') THEN
    INSERT INTO operation_events (
      user_id, site_id, origin, client_name, action, object_type, object_id,
      status, duration_ms, metadata, expires_at
    ) VALUES (
      NEW.user_id,
      NEW.site_id,
      'system',
      'BlogFactory jobs',
      'job.' || NEW.status,
      'job',
      NEW.id,
      CASE NEW.status WHEN 'running' THEN 'started' WHEN 'completed' THEN 'succeeded' ELSE 'failed' END,
      CASE WHEN NEW.status = 'running' THEN NULL ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (COALESCE(NEW.completed_at, now()) - COALESCE(NEW.started_at, NEW.created_at))) * 1000))::INTEGER END,
      jsonb_build_object('status', NEW.status),
      now() + INTERVAL '30 days'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_operation_transition ON jobs;
CREATE TRIGGER jobs_operation_transition
AFTER INSERT OR UPDATE OF status ON jobs
FOR EACH ROW EXECUTE FUNCTION record_job_operation_transition();
