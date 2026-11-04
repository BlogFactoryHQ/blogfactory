-- Bring-your-own keys for the optional SEO providers (Brave Search, DataForSEO). Encrypted like the other account keys.
ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS brave_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS brave_key_last4 TEXT,
  ADD COLUMN IF NOT EXISTS dataforseo_credentials_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS dataforseo_key_last4 TEXT;
