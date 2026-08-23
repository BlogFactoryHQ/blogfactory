# BlogFactory Cloud deployment

This private repository owns the `app.blogfactory.io` Vercel deployment. The
public [`BlogFactoryHQ/blogfactory`](https://github.com/BlogFactoryHQ/blogfactory)
repository remains the canonical open-source core.

- Shared product changes start in the public core and are merged here by
  `.github/workflows/sync-upstream.yml`.
- Cloud-only code, hosted configuration, billing, and entitlements stay here.
- Changes are never copied from this repository back to the public core
  automatically. A reusable change must be contributed to the public core
  deliberately so private Cloud code cannot leak.
- Runtime credentials belong in Vercel environment variables, never in Git.
- Vercel Hobby cannot Git-link an organization-owned private repository, so
  `.github/workflows/deploy-cloud.yml` performs the validated production deploy
  with a repository-scoped GitHub secret. The public repository is not linked
  to the Vercel project.

The sync workflow fails closed on merge conflicts and validates the merged
core before updating `main`. Public scheduled drains and image-release
workflows are intentionally absent here so production jobs do not run twice.
