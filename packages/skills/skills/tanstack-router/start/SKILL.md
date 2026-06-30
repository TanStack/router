---
name: tanstack-start
description: |
  TanStack Start full-stack framework patterns.
  Use for server functions, SSR, streaming, static generation, deployment, and middleware.
---

# TanStack Start

TanStack Start is a full-stack framework built on TanStack Router. It adds server-side capabilities including server functions, SSR, and deployment tooling.

**Note:** Start builds on Router. For client-side routing patterns (routes, navigation, data loading, search params), see `../router/`.

## Routing Table

| Topic                | Directory           | When to Use                                                               |
| -------------------- | ------------------- | ------------------------------------------------------------------------- |
| **Installation**     | `installation/`     | Quick start, project setup, vite config, deployment setup                 |
| **Setup**            | `setup/`            | Project setup, file structure, entry points, configuration                |
| **Server Functions** | `server-functions/` | createServerFn, server-side logic, middleware, validation                 |
| **Rendering**        | `rendering/`        | SSR, streaming, static generation, ISR, SPA mode, hydration               |
| **Authentication**   | `authentication/`   | Server-side auth, sessions, protected server functions                    |
| **Data**             | `data/`             | Database access, environment variables, server-side data patterns         |
| **Integrations**     | `integrations/`     | Databases (Neon, Convex, Prisma), auth providers (Clerk, Supabase), email |
| **Deployment**       | `deployment/`       | Hosting providers, production config, observability, SEO                  |
| **API Routes**       | `api-routes/`       | Server routes, REST endpoints, webhooks                                   |

## Quick Start

```tsx
// app/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

const getServerTime = createServerFn({ method: 'GET' }).handler(async () => {
  return new Date().toISOString()
})

export const Route = createFileRoute('/')({
  loader: async () => {
    const time = await getServerTime()
    return { time }
  },
  component: Home,
})

function Home() {
  const { time } = Route.useLoaderData()
  return <div>Server time: {time}</div>
}
```

## Key Concepts

- **Server Functions**: Run code on the server, called from client or loaders
- **SSR**: Server-side rendering with streaming support
- **File Structure**: `app/` directory with client/server entry points
- **Adapters**: Deploy to various platforms (Vercel, Netlify, Cloudflare, etc.)
