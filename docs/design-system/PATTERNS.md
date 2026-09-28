# Patterns — recurring tasks, composed from the components

A component is a part; a pattern is how parts answer a recurring task. Each pattern names the components it uses; none needs new code.

## Feedback: which surface for which message

| The operator needs to… | Use | Not |
|---|---|---|
| know something failed **here** and act on it | a `status-error` line under the field, or EmptyState `tone="error"` with Retry for a failed read | a toast (it leaves before it is read) |
| know something done **elsewhere on the screen** succeeded | a toast, past tense, once | a dialog |
| know a state that lasts (a broken connection, budget nearly spent) | an Alert | a toast |
| decide before something irreversible | AlertDialog naming the thing and the consequence | a toast with Undo |
| wait for a known layout | a shape-matched skeleton | a spinner in the page body |
| see a thing in progress | StatusBadge `running`, a busy button's own spinner for the action it started, Progress for a known fraction | a full-screen loader |

## A list page (Content, Runs, Sources › RSS, Review Queue)

0. **Data first.** Every column, filter and count maps to a field the API serves. What it does not serve is not drawn.
   Summaries above a list are a row of StatCards and neutral panels with outline actions — never status-filled tiles.
1. PageShell › PageHeader (title, one line, one primary, `…` menu).
2. SectionTabs if the place has sibling routes.
3. The toolbar: search (Input with a search icon) · filters · a count. When it must stay visible, it is a sticky toolbar (`z-sticky-inner`).
4. The list in one BywordCard: a Table (flush) or rows divided by `byword-border`.
5. States: first load `TableSkeleton`/`ListSkeleton`; nothing yet EmptyState `empty` with the create action; nothing matches EmptyState `filtered` with Clear filters; failed EmptyState `error` with Retry.
6. More than one page: TablePagination under the table.

## Filtering and search

- The search box searches text; everything else is a filter.
- Filters apply at once and write to the URL, so a filtered list is shareable.
- Clear filters puts every filter back and keeps the search.
- A filter is named for what it matches. RSS sources' "Reporting mode" filter matches feeds in the news/sports-news editorial mode or with the Haber content type; there is no News surface.
- Overview owns summaries; the list owns its filters and bulk actions.

## Bulk actions

- Selecting rows (header Checkbox selects the page) shows one bar with the count ("3 posts selected") and the actions; it leaves when the selection clears.
- Bulk actions are editorial (assign, change state, send drafts after preflight). Bulk delete and live publish are not offered.

## A record's detail

- Beside its list in a Sheet (a run, a source): facts as rows — mono kicker left, value right, `type-data` for numbers.
- Its own route (a post) uses PageHeader with a Breadcrumb above, StatusBadge in the header, and panels below.

## Review and delivery (Review Queue, the Review Card)

- The queue shows only real work, in priority order: blocker → changes requested → in review → stale approval → warning → last update.
- A review packet shows provenance, editorial state, the revision summary, preflight, and the destination.
- **Send to CMS draft** is enabled only with the current version, an explicit destination and a passing preflight; otherwise it is disabled and the reason is on screen (a line or a Popover "Why is this blocked?").
- A version conflict is an error state with the newer version named, never a silent overwrite.

## Forms and dialogs

- A create or edit task that returns to the page is a Dialog titled with the thing ("New campaign").
- Fields: Label above; Input, Textarea, Select (three or more options), Checkbox, RadioGroup, Switch (takes effect at once), TagInput; errors under the field.
- URLs and domains: InputAffordance with the format chrome, `url-validation.ts` to normalise.
- Footer: Cancel (outline) left of the verb (primary). A disabled primary says why.
- Settings pages: SettingNavItem rail or SectionTabs, a StatStrip of current facts, then panels.

## Destructive actions

- In RowActions, last, after a separator, in the destructive item style.
- Always confirmed by an AlertDialog that names the thing and what happens to what it contains; the confirm repeats the verb. This covers API keys, sites, CMS integrations, writer-profile tools, templates, MCP tokens and admin access — nothing is deleted on a single click.
- Prefer reversible (pause, archive) to permanent.

## Connecting things (Integrations, MCP Connections, Search Console)

- A connection card shows its state as a StatusBadge (Active, Needs attention, Failed) and its last successful use in `type-meta`.
- Broken credentials surface as an Alert on the connection and an attention row in Getting started.
- MCP tokens are shown once, with a Copy button and a tooltip "Copy token · shown once"; scope and tool counts come from `/api/mcp/capabilities`, never hardcoded.

## First run and setup

- The sidebar's Getting started checklist is the one checklist; it hands each row to the existing setup step and leaves at 100%.
- A page with nothing yet explains what will be there and offers the one action that starts it (EmptyState).
- Create Content opens on OptionCards: From a feed, From a brief, Batch import.

## Navigation and finding

- ⌘K finds pages, sites, content, actions and help; register new surfaces there.
- The site switcher changes the active site for the whole workspace; every query is site-scoped.
- Docs and Help open through `lib/external-links.ts`.
