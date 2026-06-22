ALTER TABLE user_settings
  ALTER COLUMN max_ai_images_per_day SET DEFAULT 30,
  ALTER COLUMN min_minutes_between_ai_images SET DEFAULT 5;

UPDATE user_settings
SET
  max_ai_images_per_day = 30,
  min_minutes_between_ai_images = 5,
  updated_at = now()
WHERE
  COALESCE(max_ai_images_per_day, 3) = 3
  AND COALESCE(min_minutes_between_ai_images, 15) = 15;
