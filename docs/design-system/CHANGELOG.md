# Design system changelog

Each entry says what changed and what existing screens must do.

| Class | Means | Existing screens |
|---|---|---|
| Decision | A goal, principle, scope or rule changed | Follow it in the next change that touches them |
| Addition | A new part, token or pattern | Nothing until they need it |
| Breaking | A part, token or rule is removed or renamed | Migrate before the removal date in the entry |

## 2026-09-28 — decisions moved into the repository (Decision)

Goals, principles in the order they win, and scope (`DIRECTION.md`); the visual language and the "one way per repeated thing" table (`DESIGN.md`); recurring-task patterns (`PATTERNS.md`); the content guide (`CONTENT.md`); and the new-surface steps (`BUILDING-A-SURFACE.md`) were written on 23–24 Sep for the design-system artifact and existed only there. They now live here, where coding agents read them through `AGENTS.md`. No screen changes; the text matches the code at `70aaba0`.
