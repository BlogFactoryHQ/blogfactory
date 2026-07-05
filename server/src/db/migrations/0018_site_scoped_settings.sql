-- Site-scoped article, brand, voice, image, and internal-link settings.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
      AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'user_settings'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND att.attname = 'user_id'
  LOOP
    EXECUTE format('ALTER TABLE user_settings DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_global_user
  ON user_settings(user_id)
  WHERE site_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_user_site
  ON user_settings(user_id, site_id)
  WHERE site_id IS NOT NULL;

INSERT INTO user_settings (
  user_id,
  site_id,
  image_model,
  image_style_prompt,
  image_advanced_options,
  cover_enabled,
  inline_enabled,
  inline_count,
  article_word_count,
  article_language,
  article_voice,
  voice_mode,
  custom_voice_profile,
  voice_training_samples,
  content_rules,
  custom_article_instructions,
  include_table_of_contents,
  enable_research,
  enable_internal_links,
  internal_link_sitemap_url,
  internal_link_status,
  internal_link_mode,
  internal_link_density,
  internal_link_include_patterns,
  internal_link_exclude_patterns,
  internal_link_rules,
  internal_link_index,
  internal_link_indexing_state,
  internal_link_last_synced_at,
  brand_company_name,
  brand_mentions,
  brand_value_props,
  brand_ctas,
  knowledge_base_enabled,
  knowledge_documents,
  created_at,
  updated_at
)
SELECT
  s.user_id,
  s.id,
  g.image_model,
  g.image_style_prompt,
  g.image_advanced_options,
  g.cover_enabled,
  g.inline_enabled,
  g.inline_count,
  COALESCE(g.article_word_count, 1500),
  COALESCE(
    CASE WHEN s.language = 'tr' THEN 'Turkish' WHEN s.language = 'en' THEN 'US English' ELSE NULL END,
    g.article_language
  ),
  COALESCE(g.article_voice, 'Natural'),
  g.voice_mode,
  g.custom_voice_profile,
  COALESCE(g.voice_training_samples, '[]'::jsonb),
  COALESCE(g.content_rules, '{}'::jsonb),
  g.custom_article_instructions,
  COALESCE(g.include_table_of_contents, false),
  COALESCE(g.enable_research, false),
  (s.internal_link_index IS NOT NULL),
  s.sitemap_url,
  CASE WHEN s.internal_link_index IS NOT NULL THEN 'connected' ELSE 'disconnected' END,
  COALESCE(g.internal_link_mode, 'all'),
  COALESCE(g.internal_link_density, 'balanced'),
  COALESCE(g.internal_link_include_patterns, ARRAY[]::TEXT[]),
  COALESCE(g.internal_link_exclude_patterns, ARRAY[]::TEXT[]),
  COALESCE(g.internal_link_rules, '[]'::jsonb),
  s.internal_link_index,
  NULL,
  s.internal_link_last_synced_at,
  s.name,
  COALESCE(g.brand_mentions, 'moderate'),
  '[]'::jsonb,
  '[]'::jsonb,
  false,
  '[]'::jsonb,
  now(),
  now()
FROM sites s
LEFT JOIN user_settings g ON g.user_id = s.user_id AND g.site_id IS NULL
ON CONFLICT DO NOTHING;
