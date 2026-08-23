# v0.1.0 public-release audit

Audit date: 2026-08-23. Status: **blocked; do not change repository visibility or create the release tag.**

## Results

- Gitleaks 8.30.1 scanned `main`, the additional local branch, and the current worktree diff with redaction enabled: no secret finding.
- The current tracked tree contains no image, font, PDF, office-document, CSV, or video asset requiring redistribution review.
- The last 30 GitHub Actions logs were scanned. Gitleaks reported UUID values from disposable PostgreSQL/MCP tests as generic API keys; manual inspection confirmed they were generated test record identifiers, not credentials. No internal/customer keyword hit appeared in that sample. The repository has 1,155 Actions runs, so a complete log archive scan remains open.
- GitHub Actions run `32645916436` passed the full Docker Compose smoke, including readiness, signup/login, site creation, object readback, the exact 22-tool MCP catalog, restart persistence, and the closed-signup gate. Its separate PostgreSQL and MinIO backup/restore job also passed.
- Git history is not clean for public release. Commit `652f076876119b40b20069f6906dbf91d5ff4f5d` introduced, and `1559462f77c25def16ab0671a0b0ea81cdcc55f1` later removed, `outputs/programmatic-seo-template/`. The historical XLSX, inspection NDJSON, and previews contain an Ortak Alan editorial/affiliate campaign, internal-link targets, an affiliate URL, and detailed unpublished briefs. They remain retrievable from full Git history.
- `react-router-dom` is pinned to the requested `6.30.6`, but the current npm advisory database marks every React Router release through 7.17.0 affected by `GHSA-wrjc-x8rr-h8h6` and `GHSA-337j-9hxr-rhxg`. `npm audit --omit=dev --audit-level=moderate` therefore fails with two runtime advisories and offers only the breaking 7.18.2 upgrade.

## Required owner decisions

1. Decide whether the historical Ortak Alan package is explicitly cleared for public redistribution or authorize a reviewed history rewrite/removal. The release plan forbids an automatic rewrite.
2. Authorize a React Router 7 migration, or wait for a supported React Router 6 patch and update to it. The runtime moderate gate cannot honestly be marked clean at 6.30.6 today.
3. Complete the remaining Actions log archive scan after the two blocking findings above are resolved.

Until those decisions and the Railway acceptance run are complete, keep the repository private, do not push `v0.1.0`, do not publish GHCR images or a Railway badge, and keep the live marketing surface in release-candidate language.
