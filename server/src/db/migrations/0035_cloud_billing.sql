CREATE TABLE IF NOT EXISTS billing_customers (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  polar_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  polar_subscription_id TEXT NOT NULL UNIQUE,
  polar_product_id TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('cloud', 'advanced')),
  status TEXT NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  past_due_at TIMESTAMPTZ,
  provider_modified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_subscriptions_user_idx ON billing_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS billing_entitlements (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('none', 'cloud', 'advanced', 'internal')),
  source TEXT NOT NULL CHECK (source IN ('polar', 'transition', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'revoked')),
  effective_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  limits JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  provider_modified_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  processing_started_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_webhook_events_pending_idx ON billing_webhook_events(status, received_at);
