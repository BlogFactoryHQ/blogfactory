ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by UUID;

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_events_target_idx ON admin_audit_events(target_user_id, created_at DESC);
