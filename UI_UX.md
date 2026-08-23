# BlogFactory UI/UX Notes

## Direction

BlogFactory uses a white Device Console theme inspired by technical music hardware and product-grid SaaS, adapted for content operations. The app should feel like a clean blog factory control surface: precise, dense, fast, and slightly mechanical without becoming decorative.

This is the default theme for now. Do not reintroduce the previous dark retro/pixel/ascii direction unless the user explicitly asks for that reset.

## Visual System

- Base surfaces are off-white workspace backgrounds with white panels, graphite text, pale gray hairline borders, and crisp factory-panel shadows.
- Primary actions use orange, like a record/action control.
- Links and navigation emphasis use TE-style blue.
- Secondary controls use black or graphite.
- Status colors are green, red, yellow, and orange, reserved for operational state and priority.
- Factory identity should come from assembly labels, rails, small technical marks, dividers, dense tables, and subtle drawing-grid/perforation textures.
- Avoid full-page color floods, decorative fake controls, soft SaaS gradients, oversized rounded cards, dark-mode leftovers, and landing-page treatment inside the app.

## Typography

- Body/UI font: `Space Grotesk`.
- Mono/technical labels: `IBM Plex Mono`.
- Use mono text for section labels, metadata, table headers, status labels, and small technical captions.
- Keep text compact and readable. Do not scale type with viewport width. Long names, domains, titles, and URLs must wrap or truncate intentionally.

## Shared Components

- Prefer `WorkspaceBackground`, `BywordPageShell`, `BywordCard`, `SectionHeader`, `IconTile`, `OptionCard`, `SettingNavItem`, `FactoryMark`, and `FactoryDivider` before creating new page surfaces.
- Keep `byword-*`, `factory-*`, and shadcn token names as compatibility aliases. Remap tokens rather than rewriting every page.
- Put broad style changes in `web/src/index.css`, `web/tailwind.config.ts`, shared shadcn-style primitives, and `web/src/components/layout/BywordSurface.tsx`.
- Touch page-specific classes only when they bypass the shared system or cause obvious visual mismatch.

## Controls

- Buttons are compact device controls:
  - Primary: orange action button.
  - Secondary: black/graphite device button.
  - Outline: white plate button with gray hairline border.
  - Link/ghost: blue text action or pale blue hover.
  - Destructive: red and unmistakable.
- Inputs, selects, textareas, checkboxes, radios, switches, and sliders use white console fields with crisp borders, hover states, and visible focus rings.
- Tables should stay dense, with compact rows, mono metadata/header rails, clear hover/selected states, and no wasted card padding.
- Dialogs, sheets, dropdowns, toasts, badges, progress bars, and skeletons should inherit the same panel language.

## Workflow Rules

- Auth, onboarding, and not-found can carry the strongest branded treatment, but the form itself must stay simple.
- Overview, Create Content, Review Queue, Runs, Search Growth, Sources, Content, Control, Post Editor, and admin should feel operational and fast.
- Search Growth tabs are Overview, Growth Plan, Optimize, Analytics, Indexing, and Internal Links. Growth Plan uses native dates and explicit item handoffs; it never implies automatic live publishing.
- Sidebar labels use the current task language: Overview, Create Content, Review Queue, Runs, Search Growth, Sources, Content, and Control.
- Visible product wording is **Content**, even though `/library` remains the stable technical URL. Do not show “Library” in navigation or actions.
- The News surface is removed. RSS, Campaigns, and Batch Import live under Sources.
- Overview owns cross-workspace summaries. Content owns filters, bulk actions, and inventory; avoid duplicating large analytics panels above its table.
- Visible search, command, dropdown, toggle, slider, or button controls must work. Do not add fake knobs, switches, sliders, or decorative-only controls.

## Information Architecture

- Operate: Overview `/`, Create Content `/create`, Review Queue `/review`, Runs `/runs`, Search Growth `/overview/growth`.
- Manage: Sources `/sources`, Content `/library`, Control `/control`.
- Sources tabs: RSS, Campaigns, Batch Import.
- Content tabs: Content, Image Gallery.
- Control tabs: MCP Connections, Integrations, Sites, Brand Voice, Article Settings, Usage.
- Post editing and preview use `/library/posts/:id/edit` and `/library/posts/:id/preview`.

## MCP Review Card

- Keep the Review Card a small standalone MCP App; do not embed the primary Router, Auth, or React Query application.
- Show provenance, editorial state, revision/change summary, preflight, destination, and explicit CMS draft approval.
- Read-only scope, blockers, missing destination selection, and version conflicts must be clear disabled/error states.
- The card does not edit content, restore revisions, or change editorial state.

## Input Affordance Rules

- Use affordance before instruction. If the system expects a URL or domain, shape the field so the expected input is obvious.
- URL/domain fields should use `InputAffordance` and helpers from `web/src/lib/url-validation.ts`.
- Show stable format chrome such as `https://` in the field instead of repeating it in helper text.
- Accept common pasted formats and normalize them before submit.
- Keep helper copy to one short sentence; use tooltips only for edge cases.

## Verification Checklist

- Run `npm run build` for production safety.
- Run `npm run test --workspace=web` for frontend changes.
- Run `git diff --check` before committing.
- For UI-only work, a missing local backend or `/api/*` proxy `HTTP 500` should not block completion. Verify render/build and note backend-dependent routes separately.
- Smoke-check desktop and mobile when a dev server is available, especially auth, onboarding, Overview, Create Content, Review Queue, Runs, Sources, Content, Search Growth, Control, editor, Review Card, and dialogs/dropdowns.
