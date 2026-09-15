CREATE TABLE IF NOT EXISTS plan_usage_monthly (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  manual_completed INTEGER NOT NULL DEFAULT 0 CHECK (manual_completed >= 0),
  manual_reserved INTEGER NOT NULL DEFAULT 0 CHECK (manual_reserved >= 0),
  automated_completed INTEGER NOT NULL DEFAULT 0 CHECK (automated_completed >= 0),
  automated_reserved INTEGER NOT NULL DEFAULT 0 CHECK (automated_reserved >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, period_start)
);

CREATE TABLE IF NOT EXISTS plan_usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL UNIQUE,
  period_start TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('manual', 'automated')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plan_usage_reservations_stale_idx ON plan_usage_reservations(state, created_at);
