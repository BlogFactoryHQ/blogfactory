# Optimize + Per-Site Search Console Plan

> Historical planning record. This document preserves the original proposal and is not a current product commitment; see the [documentation index](README.md) for current guides.

## Summary

Build an MVP Optimize feature that uses Google Search Console data per active site.

- Per-site Google Search Console connection, separate from existing Indexing API.
- Regular GSC sync for page/query/date performance.
- Optimize page showing `Needs Attention`, `Tracking`, and `Improved`.
- Manual page analysis with content extraction, structure checks, optional competitor URLs, and AI suggestions.
- No full Google OAuth app or SERP provider in v1.

## Key Changes

- Add `search_console_integrations`, `search_console_metrics`, `optimize_pages`, and `optimize_analyses`.
- Add a Search Console service that stores encrypted service-account JSON, normalizes GSC property URLs, and queries Search Analytics.
- Add an Optimize service that classifies page performance and analyzes manually supplied URLs.
- Add API routes under `/api/search-console` and `/api/optimize`.
- Add `/optimize` to the app with active-site stats, GSC connection, status tabs, manual analysis, and analysis drawer.

## Test Plan

- GSC property URL normalization.
- Search Analytics row mapping.
- Dropped, stable, and improved status classification.
- URL/domain guard for selected-site analysis.
- Deterministic suggestion fallback without OpenRouter.

## Assumptions And Skips

- Use service-account JSON for v1 because the repo already stores encrypted per-site Google credentials.
- Manual competitor URLs only in v1.
- Keep Google Indexing API and Search Console performance data separate.
- Sources: https://developers.google.com/webmaster-tools/v1/searchanalytics/query, https://developers.google.com/webmaster-tools/v1/how-tos/authorizing, https://developers.google.com/webmaster-tools/v1/sites.
