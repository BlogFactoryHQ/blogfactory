# Building a new surface

The order below is the shortest path to a screen that already looks like the rest of the console.

1. **Reach for the primitive first.** shadcn/ui is the base and it is already installed. Never hand-roll a second component with the same job as a primitive — install the primitive and use it. Before writing a new page surface, check `WorkspaceBackground`, `BywordPageShell`, `BywordCard`, `SectionHeader`, `IconTile`, `OptionCard`, `SettingNavItem`, `FactoryMark` and `FactoryDivider`.
2. **Wrap the route** in `BywordPageShell` — `factory-grid-bg` on a `max-w-6xl` column with `space-4`/`space-6`/`space-10` gutters.
3. **Open with `PageHeader`.** One primary action; everything else goes in its `…` menu.
4. **Add `SectionTabs`** if the section has sibling routes.
5. **Build the body from cards.** A panel is `card` + `border` + `radius-md` + `shadow-panel` (`BywordCard`). Open a panel with `SectionHeader` when it needs a title and an action.
6. **Pick the loading state before the loaded state.** List and table routes load a shape-matched skeleton — `TableSkeleton`, `ListSkeleton`, `CardGridSkeleton`, `StatRowSkeleton`, `DetailSkeleton` — never a centred spinner.
7. **Pick all three empty states.** `EmptyState` with an explicit tone: `empty`, `filtered`, `error`. Each names the next action.
8. **Put state in a badge**, never in a row background.
9. **Register the route in `CommandPalette`.**

## Where a change belongs

- Broad style changes: `web/src/index.css`, `web/tailwind.config.ts`, the shadcn primitives, and `BywordSurface.tsx`.
- A cross-feature composition: `components/patterns/` — but only once a **second** feature needs it.
- Page-specific classes: touch them only when they bypass the shared system or cause a visible mismatch.

Remap a token rather than rewriting call sites. The `byword-*` and `factory-*` names exist as compatibility aliases precisely so a theme change stays a token change.

## Rules that are not negotiable

- **Every visible control works.** No fake knobs, switches, sliders or decorative-only controls. If a search box is drawn, it searches.
- **Both themes are real.** Read `panel-*`, `grid-*` and `field-inset` for lighting; never hardcode a white inset or a dark drop shadow.
- **Colour comes from semantic tokens only.** Raw palette utilities are banned outside `components/ui/`, and `npm run lint:colors --workspace=web` enforces it.
- **Row-level destructive actions live in `RowActions`**, never as a bare icon button in the row.
- **Auth, onboarding and not-found** may carry the strongest branded treatment; the form inside them still stays plain.

## Before you call it done

Run `npm run build`, `npm run test --workspace=web`, and — for anything touching colour — `npm run lint:colors --workspace=web`. Smoke-check both themes whenever a change touches surfaces, borders or shadows, and check desktop and mobile on auth, onboarding, Overview, Create Content, Review Queue, Runs, Sources, Content, Search Growth, Control, the editor, the Review Card, and dialogs and dropdowns.
