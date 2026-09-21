# Component layers

Four layers, in dependency order. A layer may import from the layers above it, never below.

| Layer | Path | Owns |
| --- | --- | --- |
| Primitives | `components/ui/` | shadcn/ui components. Generic, no product knowledge, no data fetching. |
| Patterns | `components/patterns/` | Cross-feature compositions of primitives (empty states, row menus, skeletons, stat tiles). Used by 2+ features. |
| Layout | `components/layout/` | App shell: sidebar, layout, `PageHeader`, `SectionTabs`, `ErrorBoundary`, device-console surfaces. |
| Features | `components/<feature>/` | Product-specific components. May fetch through hooks. |

Pages in `pages/` wire data to these and compose. A page should stay under ~400 lines; when it grows
past that, the sections belong in a feature folder.

## shadcn first

1. If shadcn/ui has the primitive, install it into `components/ui/` and use it. Do not hand-roll a
   second component with the same job.
2. Customize by editing the installed primitive's CVA variants, or by adding a design token.
   Never by adding a parallel component.
3. A new component earns a place in `patterns/` only when a second feature needs it. Until then it
   lives in the feature folder that uses it.
4. Legitimately custom, product-specific components: `FactoryMark`, `FactoryDivider`, `IconTile`,
   `InputAffordance`, `StatusBadge`, `PageHeader`, `SectionTabs`, `RunWaterfall`, `BudgetBurnChart`,
   `MarkdownEditor`, and the MCP Review Card. Everything else should be a composition.

## Colour

Raw Tailwind palette utilities (`text-emerald-700`, `bg-amber-50`, `border-slate-300`, …) are
**banned outside `components/ui/`**. `npm run lint:colors` enforces this.

| Meaning | Token |
| --- | --- |
| Primary action (one per view) | `primary` (orange) |
| Navigation, links, active state | `byword-blue` / `accent` |
| Success, ready, passed | `status-success` |
| Warning, needs review | `status-warning` |
| Error, blocker, failed | `status-error` |
| Idle, pending, draft | `status-pending` |
| Running, in progress | `status-running` |
| Category, non-status accent | `factory-purple` |

Opacity suffixes carry the weight: `bg-status-success/10` for a tint, `border-status-success/30`
for a hairline, `bg-status-success` for a solid dot or badge.

Brand marks (YouTube, Reddit, …) and category icons are **not** status. They render in
`text-muted-foreground` or a category token, so red/amber/green keep meaning only operational state.

## Tables

- Rows carry no background colour by default. State lives in the badge, not the row. Only `hover`
  (`bg-muted/50`) and `selected` (blue tint) change a row background.
- Numeric columns: right-aligned, `tabular-nums`, mono (`type-data`).
- Headers: `type-kicker` (mono, uppercase).
- Row-level destructive actions go in `patterns/RowActions`, never a bare icon button.
- Loading uses `patterns/PageSkeleton` (`TableSkeleton`), not a centered spinner.
- Empty uses `patterns/EmptyState`, with the right `tone`: `empty`, `filtered`, or `error`.

## Reference

`docs/frontend-ui-system-plan-2026-09-21.md` holds the full audit, the phased plan, and the
rationale behind these rules. `UI_UX.md` owns the visual direction.
