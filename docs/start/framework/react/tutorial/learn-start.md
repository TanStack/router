---
id: learn-start
title: Learn TanStack Start by Building a Full Stack App
description: Build one TanStack Start app through eight working checkpoints, from routing and PostgreSQL to forms, accounts, SEO, deployment, and tests.
---

Build **Field notes**, a notebook with private drafts and published pages. Each chapter adds to the same app and has a runnable checkpoint, so you can inspect working code when you get stuck.

The course uses React, TanStack Start, PostgreSQL, Prisma, and Better Auth. You should be comfortable with React components, TypeScript, and a terminal. The first two chapters need no database or hosted account.

| Chapter                                           | What you build                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| [1. Setup](./learn-start/setup)                   | A server-rendered page, root document, and router.                    |
| [2. Routes](./learn-start/routes)                 | Typed links, search parameters, note URLs, and 404s.                  |
| [3. Data](./learn-start/data)                     | PostgreSQL reads through server functions and route loaders.          |
| [4. Forms](./learn-start/forms)                   | Validated writes, transaction rollback, and refreshed data.           |
| [5. Authentication](./learn-start/authentication) | Accounts, private drafts, ownership checks, and explicit publication. |
| [6. SEO](./learn-start/seo)                       | Server-rendered metadata, canonical URLs, and a public sitemap.       |
| [7. Deployment](./learn-start/deployment)         | A standalone Node build, runtime configuration, and readiness checks. |
| [8. Tests](./learn-start/tests)                   | Browser and production checks against the complete app.               |

Open the [complete example and checkpoints](https://github.com/TanStack/router/tree/main/examples/react/start-learn).

Each checkpoint has its own source directory within one pnpm package. The anonymous database chapters and the account chapters use separate databases. The deployment chapter explains the remaining hosting and account-service configuration; local production tests do not verify a hosted release.
