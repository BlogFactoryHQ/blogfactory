ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workos_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS verify_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS verify_token_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_reset_token_hash_idx ON users(reset_token_hash) WHERE reset_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_verify_token_hash_idx ON users(verify_token_hash) WHERE verify_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_workos_user_id_idx ON users(workos_user_id) WHERE workos_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);
