# Contributing to BlogFactory

BlogFactory is licensed under AGPL-3.0-only. By contributing, you agree that your contribution is provided under the same license.

Before changing code, read `README.md`, `AGENTS.md`, `FEATURE_PLAN.md`, and the relevant document under `docs/`. Keep web and MCP on the shared service layer, preserve user/site scoping, and do not expand MCP beyond CMS draft delivery.

For a change:

1. Open a focused issue or pull request describing the user-visible outcome.
2. Keep migrations additive and never include credentials, customer data, or generated secrets.
3. Add the smallest runnable regression check for non-trivial logic.
4. Run the relevant validation commands:

```bash
npm run typecheck
npm run lint --workspace=web
npm run test --workspace=web
npm run test:server
npm run build
git diff --check
```

Schema, tenant-isolation, operation-ledger, or shared control-plane changes also require `npm run test:postgres` against a disposable PostgreSQL database. Security reports belong in the private channel described in `SECURITY.md`, not in an issue.
