ALTER TABLE feeds ADD COLUMN IF NOT EXISTS run_claim_token UUID;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS run_lease_until TIMESTAMPTZ;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS run_active_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_feeds_run_lease
  ON feeds(run_lease_until)
  WHERE run_claim_token IS NOT NULL;
