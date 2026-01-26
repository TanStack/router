---
name: TanStack Start
description: Build and operate Start apps with file-based routing, server functions, and SSR.
version: 1
---

# TanStack Start

Use this skill when working on Start app routing, server-side behavior, hosting, and SEO.

## When to use

- Set up Start routing and route tree generation
- Implement server functions or server routes
- Choose hosting targets and deployment modes
- Configure ISR, caching, and SEO behavior

## Core references

| Area                | Description                               | Reference                                  |
| ------------------- | ----------------------------------------- | ------------------------------------------ |
| Routing             | Start routing structure and root route    | references/routing-start.md                |
| Server functions    | RPC-style server functions                | references/server-functions.md             |
| Server routes       | HTTP handlers and middleware              | references/server-routes.md                |
| Execution model     | Server, client, and isomorphic behavior   | references/server-execution-model.md       |
| Middleware          | Request and server function middleware    | references/server-middleware.md            |
| Environment vars    | Env loading and client exposure rules     | references/config-environment-variables.md |
| Server entry        | Server entry point and request context    | references/server-entry-point.md           |
| Client entry        | Client entry point customization          | references/client-entry-point.md           |
| Hosting             | Deployment targets and Nitro usage        | references/hosting-platforms.md            |
| Static prerendering | Prerender configuration and crawling      | references/hosting-static-prerendering.md  |
| SPA mode            | Shell mode and SPA deployment             | references/hosting-spa-mode.md             |
| ISR                 | Cache headers and revalidation            | references/hosting-isr.md                  |
| Selective SSR       | Per-route SSR modes and defaults          | references/server-selective-ssr.md         |
| Error boundaries    | Error handling and reset behavior         | references/server-error-boundaries.md      |
| Hydration errors    | Avoiding and mitigating mismatches        | references/client-hydration-errors.md      |
| Observability       | Logging, tracing, and monitoring          | references/ops-observability.md            |
| Databases           | DB access patterns                        | references/data-databases.md               |
| Auth overview       | Auth fundamentals and security            | references/auth-overview.md                |
| Auth patterns       | Implementing auth flows                   | references/auth-patterns.md                |
| Code execution      | Server/client/isomorphic patterns         | references/server-code-execution.md        |
| Environment funcs   | Server/client-only and isomorphic funcs   | references/server-environment-functions.md |
| Static server funcs | Build-time execution and caching          | references/server-static-functions.md      |
| Streaming functions | Streaming responses from server functions | references/server-streaming-functions.md   |
| SEO                 | Head management, prerendering, sitemaps   | references/seo-overview.md                 |
| LLMO                | LLM optimization patterns                 | references/seo-llmo.md                     |

## Scope boundaries

- Start skills cover server functions, hosting, and execution model.
- Router-only APIs and routing mechanics belong in skills-router.
