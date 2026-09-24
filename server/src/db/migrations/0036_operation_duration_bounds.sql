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
      CASE WHEN NEW.status = 'running' THEN NULL ELSE LEAST(2147483647::numeric, GREATEST(0::numeric, ROUND(EXTRACT(EPOCH FROM (COALESCE(NEW.completed_at, now()) - COALESCE(NEW.started_at, NEW.created_at))) * 1000)))::INTEGER END,
      jsonb_build_object('status', NEW.status),
      now() + INTERVAL '30 days'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
