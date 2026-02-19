---
title: Start Examples Migration Plan
---

This document tracks the Start-first migration from hand-maintained `examples/*/start-*` apps to Builder/CLI kits, guide-first education, and e2e fixtures for QA.

## Goals

- Make [TanStack Builder](https://tanstack.com/builder) the default source of truth for starters and templates.
- Keep exactly one issue-repro baseline per framework:
  - React: `examples/react/start-basic`
  - Solid: `examples/solid/start-basic`
- Reduce long-term maintenance burden for showcase-style examples.
- Preserve link equity while migrating docs and entry points.

## Classification Rules

- **Template**: polished end result (blog/cv/kanban) -> move to Builder kit.
- **Guide**: topical implementation pattern (auth/deploy/i18n/streaming) -> distill into guides.
- **Baseline**: minimal repro app -> keep as a stable reference example.

## Phase 1 Scope (Start examples only)

- In: `examples/react/start-*`, `examples/solid/start-*`
- Out: non-Start Router examples (handled in a later phase)

## Migration Matrix (Phase 1)

### Keep (baseline)

- React: `start-basic`
- Solid: `start-basic`

### Move to Builder Kits

- `start-blog-starter` (new)
- `start-cv-template` (new)
- `start-trellaux` / `start-convex-trellaux` -> future kanban-style kit

### Move to Guides (and/or Builder integration paths)

- Auth: `start-basic-auth`, `start-basic-authjs`, `start-clerk-basic`, `start-workos`, `start-supabase-basic`, `solid/start-basic-auth`, `solid/start-convex-better-auth`
- Deployment: `start-basic-cloudflare`, `start-bun`, `solid/start-basic-cloudflare`, `solid/start-basic-netlify`, `solid/start-basic-nitro`
- Data/rendering/features: `start-basic-react-query`, `solid/start-basic-solid-query`, `start-streaming-data-from-server-functions`, `start-basic-static`, `start-basic-rsc`, `start-i18n-paraglide`, `solid/start-i18n-paraglide`, `start-tailwind-v4`, `start-material-ui`

### Deprecate (tombstone path)

- `start-counter`
- `start-large`
- `start-bare` (React)

## SEO and Link Preservation

- Do not hard-delete legacy example paths until docs and links are fully migrated.
- Keep migration/tombstone READMEs in deprecated example folders when they are retired.
- Point all new documentation entry points to Builder first, then to guides.

## Current Progress

- Start docs now use `npx @tanstack/cli create` for CLI setup.
- Builder is the primary entry point in Start quick start/getting started docs.
- The temporary "Starter Baselines" docs nav section has been removed.
- Non-baseline Start example READMEs now point to Builder/CLI and relevant guides.
- Non-baseline `examples/*/start-*` directories have been reduced to README tombstones only.

## Pattern Assimilation Audit (completed)

The following example pattern families are now covered by docs/guides:

- Auth examples (`start-basic-auth`, `start-basic-authjs`, `start-clerk-basic`, `start-workos`, `start-supabase-basic`, `solid/start-basic-auth`, `solid/start-convex-better-auth`) -> `guide/authentication-overview`, `guide/authentication`, `guide/databases`
- Hosting/deploy examples (`start-basic-cloudflare`, `start-bun`, `solid/start-basic-cloudflare`, `solid/start-basic-netlify`, `solid/start-basic-nitro`) -> `guide/hosting`
- Streaming example (`start-streaming-data-from-server-functions`) -> `guide/streaming-data-from-server-functions`
- Styling examples (`start-tailwind-v4`, `start-material-ui`) -> `guide/tailwind-integration`, router `guide/custom-link`
- i18n Start examples (`start-i18n-paraglide`, `solid/start-i18n-paraglide`) -> router guides `guide/internationalization-i18n` and `guide/url-rewrites`
- Static/rendering examples (`start-basic-static`, `start-basic-rsc`) -> `guide/static-prerendering` and Start framework docs that cover rendering model/capabilities

Notes:

- Product-template style examples (eg trellaux variants) are intentionally not being moved into guides; they are being moved to Builder/CLI ownership.
