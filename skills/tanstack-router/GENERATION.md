# Skills Generation Information

This document describes how the TanStack Router/Start skills were generated and how to maintain them.

## Overview

This skill system provides a **hierarchical documentation structure** for AI agents to answer questions about TanStack Router and TanStack Start. The system is designed for **progressive disclosure** - agents load only what they need, starting with high-level SKILL.md files and drilling down to reference files only when necessary.

**Key stats:**

- 120 total markdown files
- 2 products (Router, Start)
- 18 topic directories (9 per product)
- ~100 reference files

## Generation Details

**Generated from documentation at:**

- **Router source**: `/docs/router/framework/react/guide/` and `/docs/router/framework/react/routing/`
- **Start source**: `/docs/start/framework/react/guide/`

## Directory Structure

```
skills/tanstack-router/
├── SKILL.md                      # Root: routes to router/ or start/
├── GENERATION.md                 # This file
│
├── router/                       # Client-side routing (9 topics, ~55 refs)
│   ├── SKILL.md                  # Product index with topic routing
│   ├── installation/             # Bundler setup, CLI, migration
│   │   ├── SKILL.md
│   │   └── references/           # vite.md, webpack.md, rspack.md, etc.
│   ├── routing/                  # Route definitions, matching
│   ├── navigation/               # Links, programmatic nav
│   ├── data-loading/             # Loaders, preloading
│   ├── search-params/            # Type-safe search params
│   ├── auth-errors/              # Protected routes, error handling
│   ├── integrations/             # UI libs, testing, React Query, state
│   ├── advanced/                 # Code splitting, SSR, devtools
│   └── type-safety/              # TypeScript patterns
│
└── start/                        # Full-stack framework (9 topics, ~45 refs)
    ├── SKILL.md                  # Product index with topic routing
    ├── installation/             # Quick start, project setup
    ├── setup/                    # Project structure, configuration
    ├── server-functions/         # createServerFn, middleware
    ├── rendering/                # SSR, streaming, static
    ├── authentication/           # Sessions, auth patterns
    ├── data/                     # Database access, env vars
    ├── integrations/             # Databases, auth providers, email
    ├── deployment/               # Hosting providers, observability
    └── api-routes/               # REST endpoints, webhooks
```

## Hierarchical Routing Design

The skill uses a **4-level hierarchy** for progressive disclosure:

### Level 1: Root SKILL.md

- Routes between `router/` (client-side routing) and `start/` (full-stack framework)
- Contains detection guidance based on user intent
- Minimal content, just routing logic

### Level 2: Product SKILL.md (router/SKILL.md, start/SKILL.md)

- Lists all topic directories for that product
- Contains quick reference and core setup patterns
- Routing table points to topic directories with "When to Use" guidance

### Level 3: Topic SKILL.md (Option D Structure)

Topic SKILL.md files use the **"Option D" structure** for maximum utility:

1. **Brief intro** (1-2 sentences)
2. **Common Patterns** section (3-6 patterns covering 80% of use cases with code examples)
3. **API Quick Reference** section (key function signatures)
4. **Detailed References** table (links to reference files with "When to Use" guidance)

This structure allows AI agents to answer most questions directly from the topic SKILL.md without loading reference files. Only edge cases or deep dives require loading references.

### Level 4: Reference Files

- Detailed patterns and examples for specific aspects
- Self-contained, focused on one sub-topic
- Loaded only when the topic SKILL.md doesn't cover the specific question

## Topic Coverage Details

### Router Topics (9 directories)

| Directory        | References | Covers                                                                                    |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `installation/`  | 6          | Vite, Webpack, Rspack, ESBuild, CLI, migration from other routers                         |
| `routing/`       | 10         | File-based routing, code-based routing, route trees, path params, layouts, virtual routes |
| `navigation/`    | 6          | Link component, useNavigate, history blocking, URL masking, rewrites                      |
| `data-loading/`  | 6          | Route loaders, deferred data, preloading, mutations, external data sources                |
| `search-params/` | 4          | Type-safe search params, validation, serialization, state management                      |
| `auth-errors/`   | 4          | Protected routes, redirects, not-found handling, error boundaries                         |
| `integrations/`  | 5          | UI frameworks, testing, animations, React Query, state management                         |
| `advanced/`      | 8          | Code splitting, SSR, router context, render optimization, scroll restoration, devtools    |
| `type-safety/`   | 3          | TypeScript inference, utility types, strict mode                                          |

### Start Topics (9 directories)

| Directory           | References | Covers                                                                      |
| ------------------- | ---------- | --------------------------------------------------------------------------- |
| `installation/`     | 4          | Quick start, project setup, vite config, initial deployment                 |
| `setup/`            | 7          | Project structure, configuration, entry points, path aliases, Tailwind      |
| `server-functions/` | 7          | createServerFn, validation, middleware, context, streaming, execution model |
| `rendering/`        | 8          | SSR, streaming, static generation, SPA mode, hydration, error boundaries    |
| `authentication/`   | 4          | Sessions, auth strategies, middleware, protected routes                     |
| `data/`             | 4          | Database access, environment variables, caching patterns                    |
| `integrations/`     | 4          | Neon, Convex, Prisma, Clerk, Supabase, Resend                               |
| `deployment/`       | 5          | Cloudflare Workers, Netlify, Vercel, Docker, observability, SEO             |
| `api-routes/`       | 3          | createAPIFileRoute, request validation, webhooks                            |

## File Templates

### Topic SKILL.md (Option D Structure)

```markdown
---
name: kebab-case-name
description: |
  One-line description of what this covers.
  Second line explains when to use it.
---

# Title

Brief intro (1-2 sentences explaining what this topic covers).

## Common Patterns

### Pattern 1: Most Common Use Case

\`\`\`tsx
// Code example
\`\`\`

Brief explanation if needed.

### Pattern 2: Second Most Common

\`\`\`tsx
// Code example
\`\`\`

[Continue with 3-6 total patterns covering 80% of use cases]

## API Quick Reference

\`\`\`tsx
// Key function signatures
functionName(options): ReturnType

interface Options {
key: type // Description
}
\`\`\`

## Detailed References

| Reference            | When to Use                             |
| -------------------- | --------------------------------------- |
| `references/file.md` | Trigger description for when to load it |
```

### Reference Files

```markdown
# Topic Name

Brief intro (1-2 sentences).

## Main Pattern

\`\`\`tsx
// Primary example
\`\`\`

## Variations

\`\`\`tsx
// Alternative approaches
\`\`\`

## API Quick Reference

\`\`\`tsx
// Function signatures relevant to this reference
\`\`\`

## Key Points

- Bullet points for important notes
- Keep concise
```

## Writing Principles

1. **Practical first**: Lead with code examples
2. **Concise**: No unnecessary prose
3. **Self-contained**: Each file should work independently
4. **Type-safe**: Show TypeScript patterns
5. **Real-world**: Use realistic examples, not foo/bar
6. **80/20 rule**: Common Patterns should cover 80% of use cases

## Updating Skills

### When to Update

**Minor updates** (typos, small clarifications):

- Fix directly in affected files
- No need to update GENERATION.md

**New features**:

- Add to appropriate topic directory
- Update topic SKILL.md Common Patterns if it's a common use case
- Update API Quick Reference if new APIs added
- Create new reference file if needed
- Update this file's topic coverage table

**API changes**:

- Update affected reference files
- Update API Quick Reference sections
- Update examples in SKILL.md files
- Check for breaking changes across files

**New topic area**:

- Create new directory under router/ or start/
- Add SKILL.md with Option D structure
- Add references/ subdirectory with reference files
- Update parent SKILL.md routing table

### Update Checklist

- [ ] Read diff of docs since last generation
- [ ] Identify new features/APIs
- [ ] Identify changed features/APIs
- [ ] Identify deprecated features
- [ ] Update affected reference files
- [ ] Update topic SKILL.md Common Patterns if needed
- [ ] Update API Quick Reference sections if needed
- [ ] Update Detailed References tables if needed
- [ ] Update product SKILL.md routing tables if needed
- [ ] Update root SKILL.md if new product areas added
- [ ] Update this file's SHA and topic tables

## When to Regenerate Completely

Consider full regeneration when:

- Major version update with breaking changes
- Complete restructure of TanStack Router/Start
- More than 50% of docs changed
- New framework support added (e.g., Solid parity)

## Version History

| Date       | Changes             |
| ---------- |---------------------|
| 2026-01-26 | Initial generation  |


## Agent Instructions Summary

**For future agents maintaining these skills:**

1. **Check docs changes**: `git diff SHA..HEAD -- docs/router/ docs/start/`
2. **Identify scope**: Which topics/references need updates?
3. **Update bottom-up**: Reference files → Topic SKILL.md → Product SKILL.md → Root SKILL.md
4. **Maintain Option D structure**: Common Patterns → API Quick Reference → Detailed References
5. **Follow 80/20 rule**: Common Patterns should handle 80% of questions without loading references
6. **Update this file**: Record changes in version history

**Key principle**: Incremental updates, not rewrites. Only change what the docs changed.

---

Last updated: 2026-01-26
