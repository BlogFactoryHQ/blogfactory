# Frontend UI System Plan — 2026-09-21

Scope: `web/` only (the authenticated Device Console). Derived from a full audit of the current
frontend plus a set of reference screenshots (onboarding checklist card, empty-state overlay,
auth/signup split screen, pricing plans, table filter dropdown, settings page, task table,
team members table, integrations directory, profile dropdown, overflow "more" menu, AI
integrations hub, sidebar getting-started tiles).

This document answers, with repo evidence, the questions that triggered it, then gives a phased
plan. It does not change behavior by itself.

---

## 0. Status — 2026-09-21

**Phase 0 and Phase 1 are shipped, plus the Phase 2 shell work and the theming decision.**

| Item | State |
| --- | --- |
| `components/patterns/` layer | shipped — `EmptyState`, `ChecklistCard`, `RowActions`, `StatCard`/`StatStrip`, `TablePagination`, `PageSkeleton` |
| shadcn primitives added | shipped — `command` (cmdk), `pagination`, `alert` |
| Colour token migration | shipped — 176 → 0 raw palette utilities; `npm run lint:colors` gates it |
| Empty states | shipped — one `EmptyState` across Posts, Runs, Gallery, Feeds, Campaigns, Personas, Overview, Review Queue, Optimize, Indexing, Programmatic, Search Growth, Usage, Batch Import, Sites, Settings, MCP panel |
| Skeletons | shipped on the main list/table routes |
| Dark mode | shipped — real `.dark` palette, `ThemeProvider`, profile-menu switch; brand/factory tokens and panel lighting are now CSS variables |
| ⌘K command palette | shipped — pages, sites, content search, actions, help |
| Sidebar getting-started checklist | shipped — `useWorkspaceReadiness` is the single source of truth |
| Profile menu | shipped — Docs, Help, Feedback, Appearance; the Notifications → `/runs` mislabel is fixed |
| Page-level `…` menu | shipped in `PageHeader`; wired on Integrations |
| Shared pagination | shipped in Posts and Runs; Image Gallery still bespoke |
| Row overflow menu | shipped in the Content table; other tables still expose inline icons |

Verification at the time of writing: `npm run typecheck`, `npm run test` (49 files, 197 tests),
`npm run lint` (0 errors), `npm run lint:colors` (clean), `npm run build`, plus a light/dark and
mobile smoke check of `/auth`. The authenticated shell was not visually smoke-checked because no
local backend session was available.

**Still open:** Phase 3 (DataTable/FilterBar, date-range filters, remaining table migrations,
the `@tanstack/react-table` decision) and Phase 4 (Connections hub, `Settings.tsx` split, members
table, two-pane auth).

---

## 1. What we build the frontend with (current, verified)

| Layer | Current choice | File |
| --- | --- | --- |
| Framework | React 18 + Vite 6 + TypeScript (SWC) | `web/package.json`, `web/vite.config.ts` |
| Styling | Tailwind CSS 3 + `tailwindcss-animate`, CSS variables | `web/tailwind.config.ts`, `web/src/index.css` |
| Component base | **shadcn/ui is already the base** — `components.json` present, 30 primitives in `web/src/components/ui/`, Radix under them | `web/components.json` |
| Data | TanStack Query 5 | `web/src/App.tsx` |
| Routing | react-router-dom 7 | `web/src/App.tsx` |
| Icons | lucide-react | everywhere |
| Toasts | sonner | `web/src/components/ui/sonner.tsx` |
| Charts | recharts (+ hand-written SVG in `usage/BudgetBurnChart.tsx`) | `web/src/components/usage/` |
| Validation | zod (server contracts), no form library | `web/src/lib/` |
| Fonts | Space Grotesk (UI), IBM Plex Mono (technical) | `web/tailwind.config.ts` |

**Answer to "which library do we use / should we move to shadcn":** we are already on shadcn +
Tailwind + Radix. Nothing needs to be migrated *to* shadcn. The real problem is **drift**: a second,
parallel, hand-rolled component layer grew next to it. The plan below is about collapsing that
drift, not switching libraries.

### Where the drift is (measured)

- **30** shadcn primitives exist, but a parallel surface layer lives in
  `web/src/components/layout/BywordSurface.tsx` (`BywordCard`, `BywordPageShell`, `SectionHeader`,
  `IconTile`, `OptionCard`, `SettingNavItem`) plus ~140 lines of component classes in
  `index.css` (`type-*`, `status-badge-*`, `factory-*`, `calm-card`). `BywordCard` duplicates
  `ui/card.tsx`; `ui/status-badge.tsx` duplicates `ui/badge.tsx`.
- **176** hardcoded Tailwind palette utilities (`text-emerald-700`, `bg-amber-50`,
  `border-amber-300`, `bg-slate-500`, …) bypass the token system in `.tsx` files, even though
  `--status-success/warning/error/pending/running` tokens already exist.
- **`DropdownMenu` is used in only 2 files** (`AppSidebar.tsx`, `Programmatic.tsx`) out of 138 `.tsx`
  files. Table rows expose bare icon buttons instead of an overflow menu.
- **No shared empty state**: ~51 ad-hoc empty states, ranging from a styled 12-unit panel
  (`Integrations.tsx:216`) to a bare `<p>` (`Overview.tsx`) to a `<TableCell colSpan>` one-liner
  (`Campaigns.tsx:577`).
- **Loading is inconsistent**: `Skeleton` is used in exactly 1 page (`RSSFeeds.tsx`); everything
  else spins a `Loader2` (20 pages).
- **Pagination is hand-rolled** per page (`Jobs.tsx:780`, `ImageGallery.tsx:393`); the shadcn
  `pagination` primitive is absent.
- **Dark mode is dead code**: `next-themes` is installed and `ui/sonner.tsx` calls `useTheme()`, but
  there is no `ThemeProvider` anywhere, and the `.dark` block in `index.css` is a byte-for-byte copy
  of `:root`. So the app has a fake dark mode that does nothing.
- **Page files are too large to hold a system**: `Settings.tsx` 2359, `ContentCreator.tsx` 1681,
  `Jobs.tsx` 1334, `Programmatic.tsx` 1298, `Personas.tsx` 1229, `Optimize.tsx` 1062,
  `RSSFeeds.tsx` 1055, `SearchGrowth.tsx` 1019, `ImageGallery.tsx` 1008 lines.
- **No form library**: every form is manual `useState` + `onSubmit`. Acceptable for small forms,
  costly in `Settings.tsx` and `RSSFeedNew.tsx`.
- **Missing shadcn primitives we now actually need**: `command` (cmdk), `avatar`, `pagination`,
  `toggle`/`toggle-group`, `hover-card`, `context-menu`, `form`, `calendar`/date-range,
  `empty`, `alert`.

### The rule going forward

> **shadcn first. Custom only where the product is genuinely different.**

Concretely:

1. If shadcn has the primitive, install it into `components/ui/` and use it. Do not re-implement.
2. Customize by editing the installed primitive's variants (CVA) or by adding a token — never by
   adding a second component with the same job.
3. Our legitimate custom layer is small and product-specific: `FactoryMark`, `FactoryDivider`,
   `IconTile`, `InputAffordance`, `StatusBadge` (as a *variant* of Badge), `PageHeader`,
   `SectionTabs`, `RunWaterfall`, `BudgetBurnChart`, `MarkdownEditor`, and the MCP Review Card.
   Everything else should be a composition of shadcn primitives.
4. No raw palette classes in pages. Colors come from semantic tokens only (§9).

---

## 2. Frontend structure to work inside

Current structure is flat-ish (`pages/`, `components/{feature}/`, `components/ui/`, `hooks/`, `lib/`)
and is basically fine. The fix is layering discipline and one new folder, not a rewrite.

```text
web/src/
  components/
    ui/          # shadcn primitives ONLY. Generated/owned by shadcn CLI. No product logic.
    patterns/    # NEW: cross-feature compositions built from ui/ (see below)
    layout/      # app shell: sidebar, layout, PageHeader, SectionTabs, ErrorBoundary
    <feature>/   # posts/, runs/, usage/, feeds/, gallery/, settings/, setup/, personas/
  pages/         # route entries: data wiring + composition only, target < 400 lines
  hooks/         # data + behavior hooks (unchanged)
  lib/           # pure logic + API (unchanged, already well tested)
```

`components/patterns/` is the missing layer. Planned contents:

| Pattern | Replaces |
| --- | --- |
| `EmptyState` | ~51 ad-hoc empty states |
| `DataTable` shell (toolbar + header + body + pagination + selection) | per-page table boilerplate |
| `FilterBar` / `FilterChip` | `PostFilters` copy-paste in Posts, Jobs, Gallery, Optimize |
| `RowActions` (overflow `…` menu) | scattered icon buttons |
| `StatCard` / `StatRow` | `Metric`, `Outcome`, Integrations 3-up grid, Usage tiles |
| `ConnectionCard` | Integrations provider cards, MCP cards, AI provider cards |
| `PageSkeleton` variants (table/cards/detail) | 20 pages of `Loader2` |
| `ChecklistCard` | setup/getting-started surfaces |
| `ConfirmDialog` | repeated AlertDialog wiring |

Rule: a component earns a place in `patterns/` when it is used by **2+ features**. Otherwise it stays
in its feature folder.

---

## 3. Onboarding

**Current:** `pages/Onboarding.tsx` (436 lines) is a good, focused 4-step first-value wizard
(site → OpenRouter key → topic → first draft) with real progress, cost preview, and error recovery.
`components/setup/WorkspaceSetupGuide.tsx` is a 6-step modal (site, AI key, CMS, Search Console, MCP,
create) reachable only from Overview's `SetupReadinessCard`, and it is dismissible per site via
`localStorage`.

**Gap vs reference:** there is no *persistent* progress surface. Once the modal is dismissed or the
first draft lands, the remaining setup (CMS, Search Console, MCP) becomes invisible. The reference
screenshot solves exactly this with a pinned "Getting started — 4%" card in the sidebar with an
inline preview tile per task.

**Plan:**
- Keep `Onboarding.tsx` as-is. It is the first-value path and it works. Do not replace it with a
  checklist.
- Extract the readiness math out of `WorkspaceSetupGuide` + `SetupReadinessCard` into one
  `useWorkspaceReadiness()` hook returning `{ steps, completedCount, percent, nextStep }` from the
  existing `/control-plane/overview` digest. Single source of truth, no new endpoint.
- Add `patterns/ChecklistCard` and mount it at the bottom of `AppSidebar` (above the profile row),
  collapsed to a compact ring + percent when the sidebar is collapsed.
  - Auto-hides at 100% and stays dismissible; dismissal moves from `localStorage` to a user
    preference only if we later add one — keep `localStorage` for now.
  - Each row opens the existing `WorkspaceSetupGuide` at that step (`?setup=<step>`), so no flow is
    duplicated.
- Keep the modal as the *doing* surface; the card is only the *seeing* surface.

---

## 4. Sidebar (the "should we add things on the side" question)

**Current:** 224px fixed sidebar, workspace/site switcher dropdown (good, already close to the
reference), a custom search dialog bound to ⌘K, two nav groups, a profile dropdown with only
Notifications / Admin Users / Sign out.

**Plan (ordered):**
1. **Replace the custom search dialog with shadcn `command` (cmdk).** Today it filters a hardcoded
   list of 8 nav links and nothing else. It should search: pages, sites (switch), posts, runs,
   settings sections, and actions (Create content, Connect CMS, Open docs). This is the single
   highest-leverage sidebar change.
2. **Getting-started checklist card** (§3).
3. **Profile dropdown** → bring it to the reference standard: Profile, Appearance (theme), Settings,
   Notifications, separator, Docs ↗, Help ↗, Send feedback, separator, Switch site, Sign out, with
   number/letter shortcut hints. `Docs` and `Help` already exist as standalone builds
   (`web/docs.html`, `web/help.html`, `Docs.tsx`, `Help.tsx`) and are currently only reachable from
   three deep links inside panels — they are effectively hidden. Surface them here.
4. **Notifications currently navigates to `/runs`** — that is a lie in the UI. Either rename it to
   "Runs" or build a real notification popover fed by the existing operation ledger. Prefer renaming
   now, real popover later.
5. Keep the collapsed rail behavior and tooltips. They are already correct.

---

## 5. Empty states

**Current:** no shared component, ~51 hand-written variants, wildly different weight.

**Plan:** one `patterns/EmptyState` with a strict API and three densities:

```tsx
<EmptyState
  size="page" | "panel" | "row"
  icon={Plug}
  title="No integrations yet"
  description="Connect WordPress, Ghost, Wix, or Framer before CMS draft delivery."
  primaryAction={{ label: "Choose a CMS", onClick }}
  secondaryAction={{ label: "Read the guide", href: "/docs/mcp" }}
/>
```

Rules:
- Every empty state must name **the next action**, not just the absence. `Posts.tsx:769` already does
  this well ("Generate one from Content Creator or add an RSS feed") — make that the baseline.
- Distinguish three cases explicitly, because they need different copy: **never had data**,
  **filtered to zero** (offer "Clear filters"), **error** (offer retry). Today `ImageGallery.tsx`
  returns the same "No images yet" title for four different situations, including failure.
- Row-density empty states inside tables use `size="row"` and stay one line.
- The reference "Currently no content available" overlay-on-blurred-table pattern is only used when
  the table has a known shape but zero rows *and* the surrounding chrome is still meaningful — do
  not blur real data.

---

## 6. Login / auth screen

**Current:** `pages/Auth.tsx` (214 lines) — centered 448px card on the factory grid, email +
password, remember me, environment-gated signup toggle, dev-only local login. It is clean and
honest. Note: `AGENTS.md` forbids password-recovery UI until real email delivery exists.

**Plan (small, deliberate):**
- Keep the single-card layout on mobile; adopt a **two-pane layout ≥ lg**: form left, product proof
  right (what the console actually does: drafts, review, CMS delivery). The reference signup screen
  is the model, but the right pane must show real product surfaces, not marketing gradients —
  `UI_UX.md` bans landing-page treatment inside the app.
- Add a password visibility toggle, `aria-invalid` + inline field errors (today every failure is a
  toast only), and `autoComplete`/`enterkeyhint` correctness.
- Add explicit error mapping for the three real failures: wrong credentials, account pending
  approval, backend unreachable. Today they collapse into one toast string.
- Do **not** add: social sign-in buttons, "forgot password", marketing copy, or a newsletter
  checkbox. None are shipped capabilities.
- Same treatment for `McpOAuthLogin.tsx` so the OAuth consent screen matches.

---

## 7. Plan management / pricing page

**Decision: not in this repository.** `AGENTS.md` → Launch Boundary is explicit: "Customer pricing,
subscriptions, checkout, entitlements, and billing webhooks are not part of this core and must not be
added here." Public marketing (including `/pricing`) belongs to the private
`BlogFactoryHQ/blogfactory-marketing` Astro repo; entitlement and billing UI belong to
`BlogFactoryHQ/blogfactory-cloud`.

What we *can* and should do here:
- `Control → Usage` (`pages/UsageAnalytics.tsx` + `components/usage/*`) is the legitimate
  cost surface: spend, budget burn, model breakdown, image costs. Finish it, don't duplicate it.
  Work already in progress in the worktree (`BudgetCard`, `BudgetBurnChart`) is the right direction.
- Keep AI provider cost language clearly separated from any notion of a subscription price. They are
  different things and `AGENTS.md` says so.
- Leave one clean extension point: a `PlanSummaryCard` slot at the top of `Control → Usage` that
  renders nothing in the open-source build and can be filled by the Cloud repo. Slot only — no copy,
  no prices, no plan names in this repo.

The reference pricing-plan screenshot is therefore a **marketing-repo** task, not an app task.

---

## 8. Dropdowns, menus, settings

### Dropdowns
- Build `patterns/RowActions` (overflow `…`) and use it on every table row: Posts, Runs, Feeds,
  Campaigns, Sites, Images, Admin Users. Destructive items get the red variant and a confirm step.
  Today Posts exposes a bare trash icon in the row — one misclick from data loss.
- Add filter dropdowns with the reference's semantics for date fields: **Today / Tomorrow /
  This weekend / Next week / 2 weeks / 4 weeks / Custom date**. Runs and Content both need a real
  date-range filter; neither has one. This requires shadcn `calendar` + `popover` (popover exists).
- Add a page-level `…` menu next to `PageHeader` actions for secondary operations (Export, Refresh,
  Docs for this page, Send feedback) — the reference "Request an integration / Feedback / Quick help
  / Documentation" menu is the model.
- Standardize dropdown content width, item height (32px), icon slot, shortcut slot, and separator
  usage in `ui/dropdown-menu.tsx` so every menu looks the same.

### Settings
`pages/Settings.tsx` is 2359 lines and is really *Article Settings* (Article Basics, Access Keys,
Models, Voice & Style, Internal Linking, Image Generation, Image Style Prompt, Brand Profile,
Knowledge Base, Call to Action, Advanced Defaults) rendered through `SettingNavItem`.

Gaps vs a complete settings surface:
- **No account/profile settings** (display name, email, password change, sessions).
- **No appearance settings** (theme, density) — see §10.
- **No workspace/site-level general settings** (site name, language, timezone, date format,
  week start). `Sites.tsx` is only a list.
- **No notification preferences** (job finished, job failed, budget threshold).
- **No danger zone** (delete site, export data). Note: self-serve export/deletion is a known Cloud
  launch gap; the app-side surface belongs here even if the Cloud policy lives elsewhere.
- **No members/roles surface** — `AdminUsers.tsx` (201 lines) is admin-only and thin. The reference
  team-members table (role, status, date joined, per-row Manage, pagination) is the target shape.

Plan:
1. Split `Settings.tsx` into `pages/settings/` with one file per section and a shared
   `SettingsSection` layout; keep the route `/control/article-settings` and its section anchors.
2. Add `Account` and `Appearance` sections under a new `/settings` route group (profile-scoped,
   not site-scoped), reachable from the profile dropdown.
3. Adopt the reference's settings row grammar everywhere: label + one-line description on the left,
   control on the right, hairline divider between rows, inline status badge on the row when a
   connection is broken (`CONNECTION ERROR`) instead of a separate alert block.
4. Explicit save affordance per section (Cancel / Update), not silent autosave, and a dirty-state
   guard.

---

## 9. Color usage (tables and generally)

**Current problem:** 176 raw palette utilities in pages compete with a complete token set that
already exists (`--primary` orange, `--accent` blue, `--status-*`, `--muted`, `--border`).

**Rules to enforce:**

| Meaning | Token | Never |
| --- | --- | --- |
| Primary action (one per view) | `--primary` (orange) | Don't use orange for status |
| Navigation / links / active state | `--accent` (blue) | Don't use blue for success |
| Success / ready / passed | `--status-success` | `emerald-*`, `green-*` |
| Warning / needs review | `--status-warning` | `amber-*`, `yellow-*` |
| Error / blocker / failed | `--status-error` | `red-*` |
| Idle / pending / draft | `--status-pending` | `slate-*`, `gray-*` |
| Running / in progress | `--status-running` | `blue-500` |

Table-specific:
- Tables carry **no background color** per row by default. State lives in the status badge, not the
  row. Only `selected` (accent tint) and `hover` (`muted/50`) change a row's background.
- Destructive rows are never red-filled; they get a red left border or a red badge.
- Numeric columns are right-aligned, `tabular-nums`, mono (`type-data` already does this).
- Column headers use `type-kicker` mono uppercase (already partly true) with sort affordance.
- Max one accent color per table. Avatars/identity dots may be a neutral gradient (the reference
  uses this well) but they must not read as status.
- Keep the factory texture (`factory-grid-bg`, `factory-divider`, `factory-panel`) at page and panel
  level only — never inside table rows, where it costs legibility.

Enforcement: an ESLint rule (or a `npm run lint:colors` grep gate) that fails on raw palette classes
in `pages/` and `components/` except `components/ui/`. Migrate the 176 occurrences in batches by
feature, not in one commit.

---

## 10. Theming / dark mode

Decide explicitly, because the current state is the worst of both worlds (a theme library installed,
a `.dark` block that does nothing, and a `useTheme()` call in `sonner.tsx`).

Recommended: **finish it.** Mount `ThemeProvider` from `next-themes` in `App.tsx`, write a real dark
palette for the `.dark` block (dark graphite panels, same orange/blue accents, same status hues at
dark-appropriate lightness), add the Appearance setting and the profile-dropdown toggle, and verify
the factory textures in dark.

Acceptable alternative: **remove it** — drop `next-themes`, delete the `.dark` block, hardcode
sonner's theme. Do not leave it as-is.

---

## 11. Integrations — one hub

**Current:** integrations are split across three unrelated surfaces:
- `Control → Integrations` (`pages/Integrations.tsx`, 586 lines): CMS destinations only —
  WordPress, Ghost, Wix, Framer, with per-provider guides and test.
- `Control → MCP Connections` (`ControlConnections.tsx` → `McpConnectionsPanel.tsx`): agent access
  tokens and server catalog.
- AI provider access is buried inside `Settings.tsx` → **Access Keys**, and Search Console lives in
  `components/search-growth/SearchConsoleDialog.tsx`.

A user asking "what is this workspace connected to?" has to visit three places and one dialog.

**Plan — a single Connections hub at `/control/connections`** with category tabs, matching the
reference integrations directory and AI-integrations hub:

```
Connections
  ├── All            (search + category filter + status filter)
  ├── CMS            WordPress · Ghost · Wix · Framer
  ├── AI providers   OpenRouter (text + image), future providers
  ├── Search         Google Search Console
  └── Agents (MCP)   tokens, scopes, server catalog, Review Card
```

- One card shape for every connection: `patterns/ConnectionCard` — icon, name, provider line,
  category tag, step count, status (`Connected` / `Not tested` / `CONNECTION ERROR`), toggle or
  Connect button, and a "View instructions" affordance. The reference's per-card
  `CONNECTION ERROR` badge is better than our current separate alert; adopt it.
- Keep the existing per-provider setup dialogs and the existing hooks — this is a re-grouping, not a
  rewrite of credential flows. Credentials stay encrypted and site-scoped; no behavior change.
- Add a header row: active site, `N connected`, last delivery — `Integrations.tsx` already has this
  3-up block; promote it to the hub.
- Add "Request an integration" and "Send feedback" in the hub's `…` menu (mailto or GitHub issue
  link — no new backend).
- Keep `Control → Integrations` and `Control → MCP Connections` as redirects to hub tabs for one
  release so no bookmark breaks. IA changes must land in `UI_UX.md` and `AGENTS.md` in the same PR.

---

## 12. Tables

Target shape (reference task table + team members table), built once in `patterns/DataTable`:

- Sticky toolbar: search, filter chips with active-count badge, group-by, sort, view/density,
  column visibility, primary action.
- Sticky header with sortable columns and per-column type icon.
- Selection column with a bulk-action bar that appears on selection (`BulkActionsBar.tsx` already
  exists for posts — generalize it).
- Row: 40–44px, hover tint, click-through to detail, `…` overflow at the end.
- Grouped sections with count badges (reference: Backlog 12 / In progress 12 / In review 12) —
  a good fit for Runs by status and Review Queue by severity.
- Footer: range + total + pagination via shadcn `pagination`. Replace the bespoke pagers in
  `Jobs.tsx` and `ImageGallery.tsx`.
- Loading: table-shaped `Skeleton` rows, not a centered spinner.
- Empty: `EmptyState size="row"`; filtered-empty offers "Clear filters".

Consider `@tanstack/react-table` for sorting/selection/column-visibility state. It is one dependency
and it removes the most duplicated logic in the app. Decide before Phase 3; if rejected, keep the
state hooks in `patterns/DataTable` instead.

`BatchImport.tsx` uses a raw `<table>` — migrate it to the primitive.

---

## 13. Phased plan

Each phase is independently shippable and ends with `npm run build`, `npm run test --workspace=web`,
and a desktop + mobile smoke check (per `UI_UX.md`'s verification checklist).

### Phase 0 — Foundation (no visible change)
1. Install missing shadcn primitives: `command`, `avatar`, `pagination`, `toggle`, `toggle-group`,
   `hover-card`, `context-menu`, `alert`, `calendar`.
2. Create `components/patterns/` with `EmptyState`, `RowActions`, `StatCard`, `PageSkeleton`.
3. Decide and land the theming decision (§10).
4. Add the color lint gate (§9), starting as a warning.
5. Write `web/src/components/ui/README.md`: the shadcn-first rule, when `patterns/` applies, the
   token table.

**Done when:** primitives exist and are unused-but-available; lint gate reports the 176 violations
without failing CI.

### Phase 1 — Consistency sweep (high value, low risk)
1. Replace all ad-hoc empty states with `EmptyState` (Posts, Runs, Feeds, Campaigns, Gallery,
   Integrations, Personas, Programmatic, Overview, SeoGrowthPlan, Settings).
2. Replace `Loader2`-centered loading with `PageSkeleton` on list/table routes.
3. Migrate raw palette classes to tokens, feature by feature; flip the lint gate to error.
4. Standardize `ui/dropdown-menu.tsx` sizing/shortcut/icon slots.

**Done when:** zero raw palette classes outside `components/ui/`; every list route has a skeleton and
a shared empty state.

### Phase 2 — Navigation and shell
1. ⌘K command palette on shadcn `command`, searching pages + sites + posts + runs + actions.
2. Getting-started `ChecklistCard` in the sidebar + `useWorkspaceReadiness()`.
3. Profile dropdown completion (Docs, Help, Feedback, Appearance, Settings); fix the
   Notifications → `/runs` mislabel.
4. Page-level `…` menu in `PageHeader`.

**Done when:** every shipped surface (including Docs and Help) is reachable in ≤ 2 interactions from
the sidebar.

### Phase 3 — Tables and filters
1. `patterns/DataTable` + `FilterBar` + `RowActions`; decide on `@tanstack/react-table`.
2. Migrate Posts → Runs → Image Gallery → Feeds → Campaigns → Admin Users, in that order.
3. Shared pagination; date-range filter on Runs and Content.
4. Migrate `BatchImport.tsx` off the raw `<table>`.

**Done when:** all six tables share one toolbar, one header, one row grammar, one pager.

### Phase 4 — Connections hub and settings split
1. Merge CMS + AI providers + Search Console + MCP into `/control/connections` with tabs and
   `ConnectionCard`; keep redirects; update `UI_UX.md` and `AGENTS.md`.
2. Split `Settings.tsx` into `pages/settings/*`; add Account and Appearance sections.
3. Reshape `AdminUsers.tsx` into the members table grammar (role, status, joined, Manage, pagination).
4. Auth two-pane layout + inline field errors.

**Done when:** connections are answerable from one screen, and no page file exceeds ~600 lines.

---

## 14. Explicitly out of scope

- Pricing, plans, checkout, entitlements, billing (see §7 — different repositories).
- Marketing copy, landing treatment, gradients, or decorative controls inside the app
  (`UI_UX.md` bans them).
- Password recovery UI (blocked on real email delivery).
- New backend endpoints. Every item above is served by existing APIs, or is presentation-only.
- Re-theming away from the white Device Console direction.

## 15. Risks

- **Worktree collision.** `EditorialSafetyPanel`, `BudgetCard`, `Jobs`, `UsageAnalytics`,
  `revision-diff` are modified and `RevisionTimeline`, `components/runs/`, `BudgetBurnChart` are
  untracked right now. Land or stash that work before Phase 1 touches the same files.
- **Big-bang refactor.** Do not convert all tables in one PR; the migration order in Phase 3 exists
  so each step is reviewable.
- **IA churn.** The Connections hub changes navigation, which `AGENTS.md` protects. It needs an
  explicit decision and doc updates in the same change.
- **`@tanstack/react-table`** is a real dependency addition; if we take it, take it once and use it
  everywhere.
