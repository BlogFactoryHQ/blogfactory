# Design system

The Device Console's decisions, in the repository where agents and people read them. The rendered catalogue (every component drawn from the shipped code, in both themes) is the design-system artifact; this folder is its source text.

## One source per question

| Question | Source |
|---|---|
| Why does the system exist, what wins a trade-off, what is in scope? | `DIRECTION.md` |
| What does it look like, and why? Which one way for a repeated thing? | `DESIGN.md` |
| How do parts answer a recurring task (list page, filters, bulk actions, forms)? | `PATTERNS.md` |
| What do we call it, how do we say it? | `CONTENT.md` |
| How do I build a new surface? | `BUILDING-A-SURFACE.md` |
| Where does a place live in the app (Operate / Manage)? | `../../UI_UX.md` › Information Architecture |
| Which component layer does a part belong to? | `../../web/src/components/README.md` |
| Which colour, shadow, radius? | `../../web/src/index.css`, `../../web/tailwind.config.ts` (enforced by `npm run lint:colors --workspace=web`) |
| What changed? | `CHANGELOG.md` |

When two sources disagree, the code wins and the doc is fixed in the same change.

## Not decided yet

These are open product decisions. Until they are written here, an agent flags them instead of assuming an answer.

- **Ownership:** who approves a change to this system, and who breaks a tie.
- **Communication:** where a design-system change is announced to the team.
- **Feedback:** where a problem with the system is reported, and how the reporter hears back.
- **Metrics:** which number shows the system is working (component reuse, screens rebuilt, drift found by `lint:colors`).
- **Deprecation:** how a part is retired: reason, replacement, affected screens, removal date.
