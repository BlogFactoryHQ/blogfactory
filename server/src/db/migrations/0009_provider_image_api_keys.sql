-- Official image provider API keys
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS openai_key_last4 TEXT;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS replicate_api_key_encrypted TEXT;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS replicate_key_last4 TEXT;
