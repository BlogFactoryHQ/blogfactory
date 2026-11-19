# v0.1.0 public-release audit

Audit date: 2026-08-23. Status: **security and history audit passed; the source is public; tagged release readiness still waits for Dokploy acceptance.**

## Results

- Gitleaks 8.30.1 scanned `main`, the additional local branch, and the current worktree diff with redaction enabled: no secret finding.
- A full checkout scan found values only in `.env`, `server/.env`, and `.vercel/.env.production.local`; `git check-ignore` confirms all three are ignored and none is tracked. They will not enter a public clone or container image.
- The current tracked tree contains no image, font, PDF, office-document, CSV, or video asset requiring redistribution review.
- All 1,160 GitHub Actions run log endpoints were retrieved. GitHub returned 1,158 valid archives and two empty archives for failed scheduler ticks (`31124673058` and `29014566446`). Gitleaks reported 556 matches across 30 PostgreSQL integration runs; every match was the redacted `tokenId` field for a disposable UUID test record. The complete readable corpus contained no email address, unmasked credential assignment, private-key marker, Ortak Alan/customer text, or internal-only/confidential marker. Phone-pattern matches were hexadecimal build identifiers, not phone numbers.
- GitHub Actions run `32647409305` passed the full Docker Compose smoke on commit `38157d9`, including readiness, signup/login, site creation, object readback, the exact 22-tool MCP catalog, restart persistence, and the closed-signup gate. Its separate PostgreSQL and MinIO backup/restore job also passed.
- Commit `652f076876119b40b20069f6906dbf91d5ff4f5d` introduced, and `1559462f77c25def16ab0671a0b0ea81cdcc55f1` later removed, `outputs/programmatic-seo-template/`. All 14 files were reviewed, including the extracted workbook XML and rendered previews. They contain no credential, personal data, customer record, or third-party image asset. They do disclose an Ortak Alan-owned 20-brief Rank Prompt affiliate campaign, referral URL, internal-link plan, and editorial instructions. The owner explicitly chose to preserve the commit history and accept that disclosure.
- `react-router-dom` is pinned to `7.18.2`. Typecheck, 133 web tests, production build, and the runtime audit pass. `npm audit --omit=dev --audit-level=moderate` reports zero vulnerabilities.
- A full development audit still reports `GHSA-67mh-4wv8-2f99` through the `drizzle-kit` CLI's legacy esbuild loader. It does not enter the production image, and npm offers only a breaking forced change to an older `drizzle-kit`; this is the documented non-runtime release exception.
- `BoraGkc/blogfactory` was made public after the audited release-candidate PR reached `main`; an unauthenticated clone resolved `origin/main` to merge commit `f8fb77fdaedc44c2a1c32efd48651a5d743520f9`.

## Remaining release gates

Deploy the prepared Dokploy blueprint to the workflow's disposable real instance and pass the same health, signup, storage, MCP, scheduler, and persistence acceptance as Docker Compose before the final tag. Repository visibility, anonymous clone, tag/release creation, upstream catalog publication, and the live marketing cutover remain separate publication actions in `FEATURE_PLAN.md`.

Until that acceptance run is complete, keep the public repository in release-candidate language, do not push `v0.1.0`, do not publish a Dokploy deploy link, and do not cut over the live marketing surface.
