-- Daily generation guardrails. The monthly budget already lives on user_settings and latches
-- budget_paused; these ceilings reset on their own each UTC day, so they are stored as plain
-- thresholds with no paused flag. NULL means the guardrail is off.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS daily_cost_limit REAL;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS daily_request_limit INTEGER;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS daily_failure_limit INTEGER;
