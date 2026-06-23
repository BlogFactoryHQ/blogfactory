ALTER TABLE user_settings
  DROP COLUMN IF EXISTS image_source_mode,
  DROP COLUMN IF EXISTS max_ai_images_per_post;
