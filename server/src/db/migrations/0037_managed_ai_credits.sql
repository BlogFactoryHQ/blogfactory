ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ai_preference TEXT NOT NULL DEFAULT 'auto'
  CHECK (ai_preference IN ('auto', 'byo', 'managed'));

CREATE TABLE IF NOT EXISTS ai_credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available_credits INTEGER NOT NULL DEFAULT 0,
  reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  debt_credits INTEGER NOT NULL DEFAULT 0 CHECK (debt_credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('purchase', 'admin')),
  source_ref TEXT NOT NULL UNIQUE,
  granted_credits INTEGER NOT NULL CHECK (granted_credits > 0),
  remaining_credits INTEGER NOT NULL CHECK (remaining_credits >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'refunded', 'charged_back')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_credit_grants_fifo_idx ON ai_credit_grants(user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS ai_credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL UNIQUE,
  reserved_credits INTEGER NOT NULL CHECK (reserved_credits > 0),
  settled_credits INTEGER,
  allocation JSONB NOT NULL,
  provider_generation_id TEXT,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released', 'reconcile')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_credit_reservations_reconcile_idx ON ai_credit_reservations(state, created_at);

CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('purchase', 'reservation', 'usage', 'release', 'expiry', 'refund_reversal', 'chargeback', 'manual_adjustment')),
  credits INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_credit_ledger_user_idx ON ai_credit_ledger(user_id, created_at DESC);
