---
name: tanstack-router
description: |
  TanStack Router and TanStack Start patterns for React/Solid apps.
  Use for type-safe routing, data loading, search params, SSR, and server functions.
---

# TanStack Router Skills

TanStack Router is a type-safe router with built-in caching and URL state management. TanStack Start is a full-stack framework built on top of Router.

## Routing Table

| Topic      | Directory | When to Use                                                                                                                                                              |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Router** | `router/` | Client-side routing: route definitions, navigation, data loading, search params, type safety. Use for any routing question that doesn't involve server functions or SSR. |
| **Start**  | `start/`  | Full-stack framework: server functions, SSR, streaming, static generation, deployment, middleware. Use when the question involves server-side code execution.            |

## Quick Detection

**Route to `router/` when:**

- Defining routes (file-based or code-based)
- Using `<Link>` or `useNavigate`
- Implementing loaders or preloading
- Working with search params or path params
- Setting up authentication guards
- Code splitting routes
- Using router context

**Route to `start/` when:**

- Using `createServerFn` or server functions
- Implementing SSR, streaming, or static generation
- Setting up API routes
- Working with middleware
- Deploying to production
- Managing environment variables on server
- Database access patterns
