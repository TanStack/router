# Skills Generation for TanStack Router

This document describes how the TanStack Router skills set is produced, where the sources live, and how to keep the skills aligned with Router documentation over time.

## Generation details

- Scope: TanStack Router only (not Start)
- Source docs: `docs/router/**`
- Output location: `skills-router/`
- Update cadence: when Router docs change meaningfully

## Structure

The skills set is organized by Router capabilities, aligned with the docs taxonomy:

- Routing concepts and mechanics
- API reference
- Integrations
- ESLint rules

Each skill set consists of:

- `skills-router/SKILL.md` (top-level overview and reference index)
- `skills-router/references/*.md` (topic references)

## File naming convention

Use descriptive prefixes that map to Router feature areas:

- `router-*` for product-level overviews or entry points
- `routing-*` for routing concepts, file-based and code-based routing
- `api-*` for API reference topics
- `integration-*` for external integrations
- `eslint-*` for rule documentation

Reference file structure requirements:

- YAML frontmatter with `name`, `description`, and `version`
- Sections: Summary, Use cases, Notes, Examples, Sources
- Include at least one code example per reference
- Capture important caveats in Notes
- Add a "Source link" line in Sources pointing to the main docs site
  (https://tanstack.com/router) alongside local doc paths

## How skills were generated

1. Inventory Router docs under `docs/router/`.
2. Group content by capability area (routing, api, integrations, eslint).
3. Extract the minimum set of skills that cover each area without overlap.
4. Normalize language and scope so skills are Router-specific.
5. Link each skill back to its source docs and record the sources in the skill file.
6. Add practical code examples and call out important caveats.

## Updating skills

When Router docs change:

1. Identify which guides, APIs, or integrations changed and why.
2. Map the change to a capability area.
3. Update only the impacted skill files.
4. Ensure no Start-only guidance is introduced.
5. Update the version history entry at the bottom of this file.

Checklist for updates:

- [ ] Doc change is reflected in skill wording
- [ ] Examples and terminology match the updated docs
- [ ] Each reference includes use cases, notes, and examples
- [ ] Frontmatter includes `name`, `description`, and `version`
- [ ] Scope stays within TanStack Router (not Start-only features)
- [ ] Version history updated

## Maintenance notes

- Prefer incremental updates over full regeneration.
- Keep the skills aligned with Router guides and API docs.
- When a doc moves or is renamed, update skill references immediately.

## Version history

| Date       | Notes                                      |
| ---------- | ------------------------------------------ |
| 2026-01-26 | Initial generation doc for Router skills   |
| 2026-01-26 | Require versioned frontmatter and examples |

## Agent instructions summary

- Use `docs/router/**` as the authoritative source.
- Keep skills scoped to Router behavior and conventions.
- Update only impacted files when docs change.
- Record changes in the version history.

## Questions and scope

- If the topic is about server functions, hosting, or execution model, it belongs to Start.
- If the topic is about routing mechanics or Router APIs, keep it in Router.

Last updated: 2026-01-26
