# Direction — why the system exists, what it decides first, what it covers

The Define layer of the Device Console: goals, principles, scope. Every other file here applies these decisions and none may contradict them. A person or an agent evaluating a change starts here: does it serve a goal, which principle decides it, is it in scope?

Recorded 23 Sep 2026 from `AGENTS.md`, `UI_UX.md`, `web/src/components/README.md` and `docs/frontend-ui-system-plan-2026-09-21.md`. A change to this file is a product decision.

## Goals

| # | Goal | Problem and evidence | Success signal |
|---|---|---|---|
| G1 | **An operator reads the state of the factory at a glance.** | Operators run several sites and many runs; the product's value is knowing what needs a decision now (Overview digest, Review Queue priority: blocker → changes requested → in review → stale approval → warning). | State is always a StatusBadge; the queue holds only real work; no page floods colour; a run's state is legible from across the desk. |
| G2 | **Every page reads as the same console.** | The 21 Sep UI audit found hand-rolled cards, raw palette colours and per-page spinners. | Pages use the page layer (PageShell, PageHeader, SectionTabs, BywordCard); `npm run lint:colors` passes; no centred spinners. |
| G3 | **A shared decision changes in one place.** | Theme work proved that call sites must not hold colours or shadows. | Tokens and primitives only; `byword-*`/`factory-*` aliases remap instead of call-site rewrites; both themes pass from the token block. |
| G4 | **Agents building UI apply these decisions instead of guessing.** | Agents build most screens; MCP is the work layer and the web is the control layer. | An agent cites the right card, reuses the primitive, and flags a missing decision rather than inventing a component. |
| G5 | **Web and MCP never disagree.** | The action queue, review packet and preflight are shared services. | UI shows what the services return; no page re-derives queue classification, stale-draft rules or destination logic. |

### Non-goals

- A public component library. The system serves one app, `web/`, and the Review Card.
- A Figma library. Code is the design source; the design-system artifact (the rendered catalogue) is generated from it.
- Marketing. It lives in its own repository and system.
- Completeness for its own sake: a part enters `components/patterns/` when a **second** feature needs it.

## Principles, in the order they win

| # | Principle | What it decides | Kept | Broken |
|---|---|---|---|---|
| P1 | **A person approves; agents draft.** | The highest agent authority is CMS **draft** creation after explicit approval. No live publish, delete, bulk mutation or credential control reaches MCP. | "Send to CMS draft" behind current version, explicit destination and a valid preflight. | An "auto-publish" switch; a bulk delete on an agent-reachable surface. |
| P2 | **Show what the backend says.** | Missing data reads as missing, with its reason and next step; projections are labelled. | RunWaterfall claims no per-step timing; BudgetBurnChart labels its projection. | A sample chart "until the API is ready". |
| P3 | **Colour is semantic.** | Hue by meaning only: orange acts, blue navigates, status colours say state, purple categorises. | A campaign chip in `factory-purple`. | A green "YouTube" badge. |
| P4 | **One way per repeated thing.** | See `DESIGN.md` › Repeated things look the same. Beats a page's local preference. | A new list's row menu is RowActions. | A trash icon beside each row. |
| P5 | **Dense, calm, task-focused.** | Small corners, 36px controls, 32px table heads, one line of help; Overview summarises, Content inventories. | A table flush in its card. | An analytics hero above the Content table. |
| P6 | **Affordance before instruction.** | Shape the control so the input is obvious; words are the fallback. | `https://` in the field; paste anything. | A paragraph explaining the URL format. |
| P7 | **Every visible control works.** | No fake knobs, switches or searches. | A disabled control that says why. | A decorative slider. |

A rule no principle supports is a proposal, not a rule.

## Scope

| Area | Status | Depth |
|---|---|---|
| `web/` authenticated app — every route, both themes, desktop and phone | **Included** | Full: tokens, primitives, patterns, layout, content, lint |
| MCP Review Card (`web/src/mcp-review/`) | **Included, standalone** | Follows the language; its own small stylesheet; never the Router, AuthProvider or React Query |
| Auth, onboarding, not-found | **Included** | Strongest branded chassis; ordinary Field parts inside |
| Docs and Help entries (`docs.html`, `help.html`) | **Included** | Same tokens and faces |
| Public marketing (Astro, separate repository) | **Excluded** | Shares the mark, colours and faces only |
| Admin routes | **Included** | Same parts; density over polish |
| BlogFactory Cloud billing surfaces | **Excluded** | Private repository |

A request outside this table is not covered; say so rather than extending the system to it.
