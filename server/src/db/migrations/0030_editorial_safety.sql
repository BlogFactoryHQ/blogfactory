CREATE TABLE IF NOT EXISTS post_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'save',
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, revision_number)
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS editorial_state TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_revision_id UUID;
ALTER TABLE post_publications ADD COLUMN IF NOT EXISTS revision_id UUID;
ALTER TABLE post_publications ADD COLUMN IF NOT EXISTS review_override BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_editorial_state_check') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_editorial_state_check
      CHECK (editorial_state IN ('draft', 'in_review', 'approved', 'changes_requested'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_approved_revision_id_fkey') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_approved_revision_id_fkey
      FOREIGN KEY (approved_revision_id) REFERENCES post_revisions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_publications_revision_id_fkey') THEN
    ALTER TABLE post_publications ADD CONSTRAINT post_publications_revision_id_fkey
      FOREIGN KEY (revision_id) REFERENCES post_revisions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_post_revisions_post_created ON post_revisions(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_revisions_user ON post_revisions(user_id);
CREATE INDEX IF NOT EXISTS idx_post_publications_revision ON post_publications(revision_id);

INSERT INTO post_revisions (post_id, user_id, revision_number, source, snapshot, created_at)
SELECT
  p.id,
  p.user_id,
  1,
  'migration',
  jsonb_build_object(
    'title', p.title,
    'content', p.content,
    'summary', p.summary,
    'cover_image_url', p.cover_image_url,
    'inline_images', p.inline_images,
    'publishing_metadata', p.publishing_metadata
  ),
  p.updated_at
FROM posts p
ON CONFLICT (post_id, revision_number) DO NOTHING;

CREATE OR REPLACE FUNCTION reset_post_editorial_state()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(NEW.title, NEW.content, NEW.summary, NEW.cover_image_url, NEW.inline_images, NEW.publishing_metadata)
    IS DISTINCT FROM
    ROW(OLD.title, OLD.content, OLD.summary, OLD.cover_image_url, OLD.inline_images, OLD.publishing_metadata) THEN
    NEW.editorial_state = 'draft';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION capture_post_revision()
RETURNS TRIGGER AS $$
DECLARE
  next_revision INTEGER;
  revision_source TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.title, NEW.content, NEW.summary, NEW.cover_image_url, NEW.inline_images, NEW.publishing_metadata)
    IS NOT DISTINCT FROM
    ROW(OLD.title, OLD.content, OLD.summary, OLD.cover_image_url, OLD.inline_images, OLD.publishing_metadata) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1
    INTO next_revision
    FROM post_revisions
    WHERE post_id = NEW.id;

  revision_source := NULLIF(current_setting('blogfactory.revision_source', true), '');
  INSERT INTO post_revisions (post_id, user_id, revision_number, source, snapshot)
  VALUES (
    NEW.id,
    NEW.user_id,
    next_revision,
    COALESCE(revision_source, CASE WHEN TG_OP = 'INSERT' THEN 'initial' ELSE 'save' END),
    jsonb_build_object(
      'title', NEW.title,
      'content', NEW.content,
      'summary', NEW.summary,
      'cover_image_url', NEW.cover_image_url,
      'inline_images', NEW.inline_images,
      'publishing_metadata', NEW.publishing_metadata
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_editorial_state ON posts;
CREATE TRIGGER trg_posts_editorial_state
  BEFORE UPDATE OF title, content, summary, cover_image_url, inline_images, publishing_metadata
  ON posts FOR EACH ROW EXECUTE FUNCTION reset_post_editorial_state();

DROP TRIGGER IF EXISTS trg_posts_revision ON posts;
DROP TRIGGER IF EXISTS trg_posts_revision_insert ON posts;
CREATE TRIGGER trg_posts_revision_insert
  AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION capture_post_revision();

DROP TRIGGER IF EXISTS trg_posts_revision_update ON posts;
CREATE TRIGGER trg_posts_revision_update
  AFTER UPDATE OF title, content, summary, cover_image_url, inline_images, publishing_metadata
  ON posts FOR EACH ROW EXECUTE FUNCTION capture_post_revision();
