# BlogFactory UI/UX Notes

## Case Study Takeaways

- Use affordance before instruction. If the system expects a URL or domain, shape the field so the expected input is obvious.
- Keep help progressive. Short inline labels should cover the common path; tooltips can explain the edge cases.
- Keep task copy separate from promotion or secondary messaging. Users should know the next action without reading a paragraph.
- Accept common pasted formats and normalize them before submit.

## BlogFactory Rules Applied

- URL/domain fields show the stable part of the format, such as `https://`, as UI chrome instead of repeating it in helper text.
- Source forms use short labels, one helper sentence at most, and tooltip help for extra context.
- Main workspace pages share the same Byword-style shell, card surface, compact headings, and direct empty-state actions.
- Navigation labels use task language: Dashboard, Create, Posts, Sources, Jobs, Brand Voice, Gallery, Usage.

## Implementation Checklist

- Added a reusable URL/domain input affordance component.
- Added URL normalization helpers and tests.
- Updated site, sitemap, source, RSS, and YouTube inputs to accept bare domains/URLs where safe.
- Removed the fake sidebar search and simplified lower navigation.
- Standardized Dashboard, Posts, Content Sources, and Job Queue page shells.

## Deferred

- Command palette search is not implemented.
- YouTube handle-to-channel-ID lookup is not implemented.
- No backend API or database shape changed.
