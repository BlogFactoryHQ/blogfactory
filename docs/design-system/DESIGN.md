# BlogFactory Device Console

BlogFactory is an agent control plane for multi-site content operations, and its interface is a **device console**: technical music hardware and product-grid SaaS, adapted for running a blog factory. MCP clients do the work — generating, reading, editing, sending approved drafts to a CMS; the web app is where an operator summarises, reviews, controls and audits it. Build surfaces that feel precise, dense, fast and slightly mechanical, and stop short of decorative. An operator should be able to read a run's state from across the desk.

Two themes are equally real. **Console** is the off-white default; **Graphite** is the same geometry and the same accents lit from a dark plate — surfaces go down, text goes up, hue stays. Never ship a change that only works in one.

## How to use it

- **Start with `DIRECTION.md`** — the goals, the principles in the order they win, and what this system covers. Then this file for the visual language, `PATTERNS.md` for recurring tasks, `CONTENT.md` for words, `BUILDING-A-SURFACE.md` for a new screen, and `web/src/components/README.md` for the component layers. `README.md` in this folder says which file answers which question.
- **Code is the design source.** Components live in `web/src/components`; import them from the app. The design-system artifact renders every component from the shipped code in both themes and is a view of this folder, not a second source.
- **Tokens.** `web/src/index.css` holds the variables as **bare HSL triplets** (`--primary: 13 100% 55%`) for Console and Graphite, and `web/tailwind.config.ts` maps them to utilities. Every call site wraps them: `hsl(var(--primary))`, or `hsl(var(--primary) / 0.14)` for a tint. The lighting and grid tokens (`panel-*`, `grid-*`, `field-inset`) are complete colours.
- **Where a change belongs.** Broad style: `web/src/index.css`, `web/tailwind.config.ts`, the shadcn primitives in `components/ui/`, and `components/layout/BywordSurface.tsx`. Remap a token rather than rewriting call sites — `byword-*` and `factory-*` exist as compatibility aliases precisely so a theme change stays a token change.
- **Checks before calling it done**: `npm run build`, `npm run test --workspace=web`, `npm run lint:colors --workspace=web` for anything touching colour, and a smoke check of both themes on desktop and phone.

## Not synced

- The **MCP Review Card** (`web/src/mcp-review/`) is a standalone MCP App with its own small stylesheet; it follows this language but is not rendered here. It never embeds the Router, AuthProvider or React Query.
- **Public marketing** lives in a separate Astro repository with its own system; it shares the mark, the colours and the two faces, not components.
- **Auth, onboarding and not-found** carry the strongest branded chassis (`factory-coal`, `device-perforation`); their forms are the ordinary Field parts documented here.

## Overview

The console is built from four ideas, and every rule below serves one of them:

1. **Plates on a drawing grid.** The workspace is an off-white floor ruled with a faint 40px grid. Everything the operator works with sits on a white plate that is lit from above — a highlight along its top edge, a shade closing the bottom, a hairline and a soft drop underneath.
2. **Colour is a signal, not a mood.** Graphite ink and pale hairlines carry the page. Orange is the one action. Blue is where you are and where a link goes. Green, amber, red, grey and blue-running say what state a thing is in — and only that.
3. **Mono is the machine.** Space Grotesk is the operator's voice; IBM Plex Mono is the machine's: labels, metadata, ids, counts, table headers, statuses.
4. **Density is respect.** Small corners, 32px table heads, 36px controls, one-line help. The operator runs several sites; the screen should hold a working set, not a hero.

## Colors

Colour comes from semantic tokens only. Raw Tailwind palette utilities (`text-emerald-700`, `bg-amber-50`, `border-slate-300`) are banned outside `components/ui/`, and `npm run lint:colors --workspace=web` enforces it.

### Named Rules

- **The one-orange rule.** `primary` belongs to the single primary action on a surface. Two orange buttons means one of them is wrong.
- **The badge rule.** State lives in the badge, not the row. Rows, cards and pages never take a status fill; only hover (`byword-blue-soft`/45) and selection (`byword-blue-soft`) change a row.
- **The category rule.** A category that is not a state takes `factory-purple` (or `factory-amber`), never a status hue. Brand marks (YouTube, Reddit) render neutral so red, amber and green keep their operational meaning.
- **The lighting rule.** Read `panel-highlight`, `panel-shade`, `panel-edge`, `panel-drop`, `panel-lift`, `grid-line`, `grid-glow` and `field-inset`. Never hardcode a white inset or a dark drop — those tokens are what make Graphite work.

### Primary — the record/action orange

`primary` (13 100% 55%; 57% lightness in Graphite) is the record button on a device: the primary Button, a checked Checkbox, an on Switch, a Progress bar, the focus `ring`, text selection (at 35%). The primary Button's edge is a literal `#D43A14` and its hover `#F04416` — the only two hex values in the primitives, kept exact.

### Navigation blue

`byword-blue` (207 70% 52%) and its shadcn alias `accent` are navigation and link emphasis: the PageHeader kicker, the active sidebar item and section tab, link buttons, the IconTile glyph, the checklist ring. `byword-blue-soft` is the only blue allowed as a fill — hover, selection, the active tab's wash. Blue is never an action.

### Neutrals

| Token | Console | Graphite | Job |
|---|---|---|---|
| `background` | 60 14% 96% | 210 7% 9% | The workspace floor under the grid |
| `card` | 0 0% 100% | 210 7% 12% | Every plate, every field |
| `popover` | 0 0% 100% | 210 7% 13% | Menus, selects, tooltips, the palette — a step above `card` in Graphite |
| `muted` | 60 9% 91% | 210 7% 16% | Table header rail, tab rail, switch track, disabled fields, skeletons |
| `foreground` | 210 5% 20% | 60 9% 91% | Graphite ink |
| `muted-foreground` | 210 4% 42% | 210 6% 62% | Body copy under titles, metadata, headers |
| `border` | 80 5% 84% | 210 7% 21% | The hairline |
| `byword-border` | 75 5% 83% | 210 7% 21% | The shell hairline (BywordCard, PageHeader, SectionHeader) — a hair warmer |
| `input` | 75 4% 72% | 210 7% 28% | Field and outline-button hairline — darker, so a field reads as an opening |
| `secondary` | 210 5% 13% | 210 6% 22% | The black device key and the active Tabs trigger |

### Status — reserved for operational state

| Token | Console | Graphite | Means |
|---|---|---|---|
| `status-success` | 163 100% 26% | 163 55% 48% | Completed, active, approved, connected |
| `status-warning` | 37 100% 42% | 37 92% 57% | Needs review, paused, attention |
| `status-error` | 5 75% 49% | 5 78% 60% | Failed, blocker, rejected (`destructive` is its twin for actions) |
| `status-pending` | 210 4% 54% | 210 6% 55% | Pending, draft, idle |
| `status-running` | 207 72% 53% | 207 72% 62% | Running, in progress |

Opacity suffixes carry the weight: `/14` for a badge fill, `/10` for an alert or error tile, `/35` (or `/30`) for the hairline, solid for a dot.

### Factory aliases

`factory-coal` (the darkest plate: auth and onboarding chassis), `factory-paper` (the warm editorial tint), `factory-amber` (priority and quota marks that are not warnings), `factory-purple` (the one categorical hue). `byword-ink` and `byword-blue-muted` are compatibility names for older call sites.

### Sidebar

The rail has its own set so it can sit a step off the workspace: `sidebar-background` (60 12% 94%), `sidebar-foreground`, `sidebar-muted`, `sidebar-border`, with `sidebar-primary` = blue and `sidebar-ring` = orange.

### Graphite

The `.dark` block (next-themes, class strategy, `blogfactory-theme` storage key) lowers surfaces, raises text, and keeps every hue. The highlight dims to 5% white; shades and drops become black at 35–50%; `byword-blue-soft` becomes a deep 207 45% 20%; status foregrounds flip to the dark ink so filled chips stay legible. In this system the same block answers to `[data-theme=dark]`.

### Contrast

Everything clears 4.5:1 on the grounds its token note names, in both themes, with two inherited exceptions kept exact and designed around:

- `byword-blue` on `card` is 3.5:1 in Console — enough for the 2px tab borders, icons and dots it draws (3:1), short for small text. Keep blue text to the kicker and active navigation, where position and weight carry it too. Graphite passes at 6.7:1.
- `status-warning` as text on `card` is 2.9:1 in Console. It never carries meaning alone: StatusBadge always pairs it with an icon and a word.

## Typography

Two faces, both from Google Fonts: **Space Grotesk** (400–700) for the interface and **IBM Plex Mono** (400–700) for anything machine-produced. Body text sets with `ss01` and kerning on, no synthesised bold, zero letter-spacing everywhere (any `tracking-*` utility is reset to 0), `text-wrap: balance` on headings and `pretty` on paragraphs.

### Hierarchy

| Style | Face | Size / leading | Weight | Use |
|---|---|---|---|---|
| `type-page-title` | Sans | 26px / 1.12 (24px below sm) | 600 | One per route, in PageHeader |
| `type-panel-title` | Sans | 16px / 1.375 | 600 | Card, SectionHeader, dialog (18px) titles |
| `type-object-title` | Sans | 14px / 1.375 | 600 | The name of a row's subject: a post, a site, a source |
| `type-body` | Sans | 14px / 24px | 400 | Supporting prose, in `muted-foreground` |
| `type-editorial` | Sans | 15px / 28px | 400 | The article itself, in the editor and preview only |
| `type-control` | Sans | 13px / 1.2 | 600 | Button and tab labels (12px on `sm` buttons and SectionTabs) |
| `type-kicker` | Mono | 10px / 1.4 | 600, uppercase | Labels above a section, a stat, a page title; menu labels |
| `type-table-head` | Mono | 10px / 1.4 | 600, uppercase | Column headers on the header rail |
| `type-meta` | Mono | 11px / 16px | 400 | Timestamps, ids, counts, help lines |
| `type-status` | Mono | 11px / 1.4 | 600 | The word inside a StatusBadge |
| `type-data` | Mono | inherits (14px in cells) | 500, tabular | Numbers that must line up |

Stat numbers are the one large figure: 30px/600 tabular sans in StatCard, 24px in StatStrip.

### Named Rules

- **Never scale type with the viewport.** The page title steps from 26px to 24px below `sm` and stops.
- **Uppercase is a style, not a spelling.** Write kickers and headers in sentence case in code; CSS sets them uppercase so screen readers read words.
- **Mono means machine.** If a person wrote it (a title, a description), it is sans. If the system produced it (an id, a time, a count, a state), it is mono.
- **Long names wrap or truncate on purpose.** Domains, titles and URLs never stretch a cell: `min-w-0` + `truncate`, or `break-words` for titles.

## Layout

### The page layer — one structure for every page

1. `WorkspaceBackground` — `factory-grid-bg` at full height.
2. `BywordPageShell` — a 1152px (`max-w-6xl`) centred column; side gutters 16 / 24 / 40px at base / sm / lg; top and bottom 24px, 32px from lg. Wide single-table pages and SectionTabs use `max-w-7xl` (1280px).
3. `PageHeader` — blue kicker, title, one line; actions right; a `byword-border` rule 20px below, 24px above the first block.
4. `SectionTabs` — sticky at the top of the column when the place has sibling routes.
5. Panels — `BywordCard`, opened by `SectionHeader` when they need a title and an action. Gaps between panels: 16px in a grid, 24px between blocks.

The shell sits right of the fixed `AppSidebar`: 224px wide (content offset 236px from lg), 60px collapsed and forced collapsed below 1024px (offset 64px).

### Named Rules

- **Overview owns summaries; Content owns inventory.** Don't repeat a large analytics panel above a table that already filters itself.
- **One primary per surface**, in the PageHeader or the panel that owns the task. Banners, row actions and secondary panels use outline or secondary.
- **The title is the place's name.** A page is titled with the sidebar or tab label that opened it — Runs, RSS sources, Usage, Users — never an internal name ("Job Queue", "Admin Users").
- **Controls line up on 36px.** Buttons, inputs, selects, the tab rail. Dense rows use 32px.
- **No wasted card padding around tables.** A table sits flush in its BywordCard; the card's hairline is the table's frame.
- **Sticky toolbars float.** A page-level toolbar that sticks (Content's filters and bulk bar, the RSS toolbar) is `rounded-md`, `byword-border`, `background`/92 with a backdrop blur and a `panel-lift` drop, at `z-sticky-inner` (20).

### Information architecture

Operate: Overview `/`, Create Content `/create`, Review Queue `/review`, Runs `/runs`, Search Growth `/overview/growth`. Manage: Sources `/sources` (RSS, Campaigns, Batch Import), Content `/library` (Content, Image Gallery), Control `/control` (MCP Connections, Integrations, Sites, Brand Voice, Article Settings, Usage). Post edit and preview stay at `/library/posts/:id/edit` and `/preview`. The visible word is **Content**; "Library" never appears. Details in `UI_UX.md` › Information Architecture.

### Data visualisation

Charts are drawn, not decorated: mono axes and labels, `border` gridlines, hue by meaning — completed `status-success`, failed `status-error`, running `status-running`, spend and projections in `byword-blue`, the selected thing in `primary`. A projection is dashed and labelled as a projection. Every chart prints the numbers it draws (RunWaterfall, BudgetBurnChart). No gradients beyond a 20% area fill, no 3D, no pie charts for fewer than three parts.

## Elevation & Depth

Lighting, not depth. A plate is lit from its top edge and closed at its bottom; it does not float. There are only four heights: the floor, a plate, a lifted plate (hover on a link card), and the overlay layer.

### Shadow Vocabulary

| Token | Recipe | Where |
|---|---|---|
| `shadow-panel` | top highlight · bottom shade · 1px edge · 0 10px 28px drop | `.factory-panel`: cards, IconTile, the mark, table shells, dialogs, sheets, menus, popovers, tooltips |
| `shadow-field` | inset 0 1px 2px `field-inset` | Inputs, selects, textareas, the switch track, progress — recessed into the plate |
| `shadow-action` | white 32% top inset · 2px dark bottom inset · 1px edge | The primary and destructive keys — the same in both themes, a coloured key is lit by its own fill |
| `shadow-device` | white 12% top inset · 2px black bottom inset · edge | The black secondary key and the active Tabs trigger |
| `shadow-plate` | top highlight · 1px edge | The outline button — a plate, not a key |
| `shadow-rail` | top highlight only | TabsList, the table header rail, checkbox, radio, sidebar controls |
| `shadow-lift` | 0 12px 28px `panel-lift` | Added under an OptionCard or linked StatCard as it rises 2px |
| `shadow-toast` | edge + lift | Toasts |

### Named Rules

- **Plates don't stack.** Never a card in a card; use a hairline or a kicker inside.
- **Overlays share one layer** (`z-overlay`, 50) over a `foreground`/35 scrim with a 1px blur.
- **Graphite never paints white lines.** The highlight is 5% there; if a surface shows a bright top stripe in dark mode, it hardcoded a white inset.

## Shapes

`--radius` is 0.375rem and everything derives from it. `radius-lg` 6px is the largest corner in the system (feature panels, editor surfaces). `radius-md` 4px for the shared plates — Card, BywordCard, Dialog, Alert, OptionCard, StatCard, the palette. `radius-sm` 2px for every control — buttons, fields, tabs, badges, menus, tooltips, toasts, the checkbox, the (square) radio and the switch with its square thumb. `radius-full` only for what is genuinely round: status dots, the checklist marks and the scrollbar thumb. Nothing is pill-shaped.

## Components

The app is built on shadcn/ui primitives, and the rule is firm: never hand-roll a second component with the same job as a primitive — install the primitive and edit its variants. Components sit in four layers, and something earns the next layer up only when a **second** feature needs it:

1. `components/ui/` — shadcn primitives: generic, no product knowledge, no data fetching.
2. `components/patterns/` — cross-feature compositions: EmptyState, ChecklistCard, RowActions, StatCard/StatStrip, TablePagination, PageSkeleton.
3. `components/layout/` — the shell: AppSidebar, AppLayout, PageHeader, SectionTabs, CommandPalette, ErrorBoundary, and the `BywordSurface` set (WorkspaceBackground, BywordPageShell, BywordCard, SectionHeader, IconTile, OptionCard, SettingNavItem, FactoryMark, FactoryDivider).
4. `components/<feature>/` — product-specific (RunWaterfall, BudgetBurnChart, MarkdownEditor, the Review Card).

### The catalogue

| Group | Cards |
|---|---|
| Brand | FactoryMark · FactoryDivider · IconTile |
| Actions | Button · RowActions · DropdownMenu · CommandPalette |
| Forms | Field · Input · InputAffordance · Textarea · Select · Checkbox · RadioGroup · Switch · Slider · TagInput |
| Navigation | AppSidebar · SectionTabs · Tabs · Breadcrumb · Pagination · SettingNavItem |
| Surfaces | PageShell · PageHeader · SectionHeader · Card · OptionCard · Dialog · AlertDialog · Sheet · Popover · Tooltip · Accordion · Collapsible · ScrollArea · Separator |
| Status | StatusBadge · Badge · Alert · Toaster · Progress · Skeleton · EmptyState · ChecklistCard |
| Data | Table · StatCard · RunWaterfall · BudgetBurnChart |

Every card in the design-system artifact states what it is for, when not to use it, its states, keyboard and accessibility behaviour, what the consumer supplies, and what not to do with it.

### Repeated things look the same

| Thing | The one way |
|---|---|
| Page top | PageHeader: kicker, title, one line, one primary + `…` |
| Sibling routes | SectionTabs |
| In-page views | Tabs (black active key) |
| A row's actions | RowActions `…`, destructive last |
| State | StatusBadge (icon + word) |
| Kind or count | Badge |
| Nothing here | EmptyState with the right tone |
| Loading | a shape-matched skeleton |
| Done elsewhere | a toast |
| Irreversible | AlertDialog |
| A URL or domain | InputAffordance + `url-validation.ts` |
| Finding anything | ⌘K CommandPalette |
| A source type (rss, youtube…) | `formatSourceType()` from `lib/source-labels` → RSS, YouTube, Brief |
| An editorial state | `editorialStateBadge()` from `lib/editorial-state` → StatusBadge |
| A metric tile | StatCard (tone = dot + hairline, never a fill) |
| A lasting notice | Alert, with an outline action |
| Setup | the Getting started checklist |

## Iconography

Icons are [lucide-react](https://lucide.dev), no exceptions and no second set, drawn at **1.8 stroke** where the call site sets it (IconTile, SettingNavItem, StatCard kickers) — lighter than lucide's 2, which keeps a dense table from looking furry.

- 16px inside buttons, table rows, menu items and fields.
- 14px inside a StatusBadge or beside a `type-kicker`.
- 20px inside an IconTile or a settings rail row.

An icon inherits `currentColor`; colour its parent with a token, not the icon. An icon never carries meaning alone: pair it with a word, or give it a tooltip and an accessible name. A spinning icon appears in exactly two places: the `running` StatusBadge, and a 16px `Loader2` inside a busy button in place of its leading icon. Never centred in a page body — that is a skeleton.

The mark (`assets/Logos/blogfactory-mark.svg`) is a 64px plate with three unequal graphite bars and an orange lamp; it carries literal colours, so on dark grounds use the CSS-built `FactoryMark`.

## Motion

Motion confirms; it never performs. `transition-calm` (150ms ease-out) is the default on every control. `transition-gentle` (200ms ease-in-out) is for anything that changes size.

| What | Motion |
|---|---|
| Press | Buttons drop 1px (`active:translate-y-px`); disabled buttons don't |
| Hover a link card | Rise 2px + `shadow-lift` (OptionCard, linked StatCard) |
| Menus, selects, popovers, tooltips | Fade + zoom from 95% + a 2px slide away from the trigger |
| Dialog, alert dialog | Fade + zoom 95%, 200ms |
| Sheet | Slide from its edge: 500ms in, 300ms out |
| Accordion | Height, 200ms |
| Content arriving | `fade-in` (4px rise, 300ms) and `slide-in-right` are defined in the Tailwind config but no component uses them yet — reach for them before writing new keyframes |
| Live | `pulse-gentle` (2s, opacity 1 → .7) on an open run's bar in RunWaterfall; `animate-pulse` on skeletons; `animate-spin` only on the running badge and a busy button's icon |

### Character: the texture marks

Factory identity comes from assembly labels, rails, small technical marks and textures — not from colour. `factory-grid-bg` (40px drawing grid + a top bloom) under every page; `factory-divider` (the hatched rule) on SectionHeaders and closing major blocks; `pixel-edge` on OptionCards; `device-hairline-bg` (18px) inside skeletons and behind diagrams; `device-perforation` (8px) and `factory-scanlines` (9px) on branded chassis. A few per page, never animated, always `aria-hidden`.

## Do's and Don'ts

### Do:

- Put the one thing this screen exists for in orange, and everything else in outline, ghost or black.
- Say state in a StatusBadge with an icon and a word.
- Load lists and tables with a skeleton shaped like them.
- Give every empty, filtered and failed state its next action.
- Put the format in the field (`https://`), accept any paste, normalise before submit.
- Put row-level destructive actions in RowActions behind an AlertDialog.
- Register every new surface in the ⌘K palette.
- Read lighting from `panel-*`, `grid-*` and `field-inset`, and check both themes.
- Keep labels in task language: Overview, Create Content, Review Queue, Runs, Search Growth, Sources, Content, Control.

### Don't:

- Flood a page, card or row with a status colour.
- Add fake or decorative-only controls — a drawn switch, slider, search or button must work.
- Use soft SaaS gradients, oversized rounded cards, blue-purple washes or landing-page heroes inside the app.
- Show "Library" anywhere visible, or restore removed surfaces (News) and old routes.
- Put a centred spinner in a page body.
- Add a live-publish, delete-in-bulk or credential control to anything an agent can reach; the highest agent authority is a CMS **draft** after explicit approval.
- Hardcode a colour, a white inset or a dark drop outside the primitives.
- Add a letter-spacing utility (`tracking-*`); the console sets zero tracking everywhere.
- Put a coloured left border on a card, notice or heading; only an active navigation item carries the 2px blue rule.
- Use `window.confirm`, `window.prompt` or `window.alert`.
