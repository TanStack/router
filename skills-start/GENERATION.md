# Skills Generation for TanStack Start

This document describes how the TanStack Start skills set is produced, where the sources live, and how to keep the skills aligned with Start documentation over time.

## Generation details

- Scope: TanStack Start only (not Router)
- Source docs: `docs/start/**` plus Start-relevant routing and execution docs
- Output location: `skills-start/`
- Update cadence: when Start docs change meaningfully

## Structure

The skills set is organized by Start capabilities, matching the docs hierarchy where possible:

- Guides (routing, server functions, hosting, execution model)
- Tutorials (end-to-end flows and recipes)
- Onboarding (quick start, getting started, build from scratch)

Each skill set consists of:

- `skills-start/SKILL.md` (top-level overview and reference index)
- `skills-start/references/*.md` (topic references)

## File naming convention

Use descriptive prefixes that map to Start feature areas:

- `start-*` for product-level overview or entry points
- `routing-*` for file-based routing and route tree generation
- `server-*` for server functions, server routes, and execution model
- `hosting-*` for deployment and hosting guidance
- `data-*` for loaders, actions, and data flow
- `auth-*` for authentication and security topics
- `seo-*` for document head management, sitemaps, and metadata

Reference file structure requirements:

- YAML frontmatter with `name`, `description`, and `version`
- Sections: Summary, Use cases, Notes, Examples, Sources
- Include at least one code example per reference
- Capture important caveats in Notes
- Add a "Source link" line in Sources pointing to the main docs site
  (https://tanstack.com/start) alongside local doc paths

## How skills were generated

1. Inventory Start docs under `docs/start/`.
2. Group content by capability area (routing, server, hosting, data, auth, seo).
3. Extract the minimum set of skills that cover each area without overlap.
4. Normalize language and scope so skills are product-specific.
5. Link each skill back to its source docs and record the sources in the skill file.
6. Add practical code examples and call out important caveats.

## Updating skills

When Start docs change:

1. Identify which guides or tutorials changed and why.
2. Map the change to a capability area (routing, server, hosting, data, auth, seo).
3. Update only the impacted skill files.
4. Check for overlap with Router skills and keep boundaries clear.
5. Update the version history entry at the bottom of this file.

Checklist for updates:

- [ ] Doc change is reflected in skill wording
- [ ] Examples and terminology match the updated docs
- [ ] Each reference includes use cases, notes, and examples
- [ ] Frontmatter includes `name`, `description`, and `version`
- [ ] Scope stays within TanStack Start (not Router-only APIs)
- [ ] Version history updated

## Maintenance notes

- Prefer incremental updates over full regeneration.
- Keep the skills aligned with Start guides first; tutorials are supporting evidence.
- When a doc moves or is renamed, update skill references immediately.

## Version history

| Date       | Notes                                      |
| ---------- | ------------------------------------------ |
| 2026-01-26 | Initial generation doc for Start skills    |
| 2026-01-26 | Require versioned frontmatter and examples |

## Agent instructions summary

- Use `docs/start/**` as the authoritative source.
- Keep skills scoped to Start behavior and conventions.
- Update only impacted files when docs change.
- Record changes in the version history.

## Questions and scope

- If the topic is about routing mechanics or shared APIs, consider Router skills.
- If the topic is about server functions, execution model, or hosting, keep it in Start.

Last updated: 2026-01-26
