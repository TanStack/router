---
id: multi-tenant-routing
title: Multi-Tenant Subdomain Routing
---

This guide covers how to implement multi-tenant subdomain routing in TanStack Start. You will learn how to extract tenant information from subdomains, pass it through middleware context, and access it in route loaders and components.

## Overview

Multi-tenant applications serve different organizations (tenants) from a single codebase. A common pattern is using subdomains to identify tenants:

- `acme.example.com` serves the "acme" tenant
- `globex.example.com` serves the "globex" tenant
- `example.com` serves the main landing page (no tenant)

TanStack Start's middleware system makes this straightforward by:

1. Extracting the subdomain from the request host header
2. Looking up tenant details (optionally from a database)
3. Passing tenant context through the middleware chain
4. Making tenant data available in loaders and components

## Basic Subdomain Extraction

Start with a middleware that extracts the subdomain from incoming requests:

```tsx
// src/middleware/tenant.ts
import { createMiddleware } from '@tanstack/react-start'

export type Tenant = {
  slug: string
  name: string
  id: string
}

function extractSubdomain(host: string): string | null {
  // Handle localhost for development
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    // Support tenant.localhost:3000 pattern
    const parts = host.split('.localhost')[0].split('.')
    return parts.length > 0 && parts[0] !== 'localhost' ? parts[0] : null
  }

  // Production: extract subdomain from host
  // example.com -> null
  // acme.example.com -> acme
  // www.example.com -> null (www is not a tenant)
  const parts = host.split('.')
  if (parts.length >= 3) {
    const subdomain = parts[0]
    // Exclude common non-tenant subdomains
    if (['www', 'api', 'app'].includes(subdomain)) {
      return null
    }
    return subdomain
  }

  return null
}

export const tenantMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const host = request.headers.get('host') || ''
    const subdomain = extractSubdomain(host)

    if (!subdomain) {
      // No tenant context (main site)
      return next({
        context: { tenant: null },
      })
    }

    // For now, create a simple tenant object from the subdomain
    // In production, you would look this up in your database
    const tenant: Tenant = {
      slug: subdomain,
      name: subdomain.charAt(0).toUpperCase() + subdomain.slice(1),
      id: subdomain,
    }

    return next({
      context: { tenant },
    })
  },
)
```

## Register as Global Middleware

Apply the tenant middleware globally so every request has tenant context:

```tsx
// src/start.ts
import { createStart } from '@tanstack/react-start'
import { tenantMiddleware } from './middleware/tenant'

export const startInstance = createStart(() => ({
  requestMiddleware: [tenantMiddleware],
}))
```

## Database Tenant Lookup

In production, you will want to look up tenant details from your database:

```tsx
// src/middleware/tenant.ts
import { createMiddleware } from '@tanstack/react-start'
import { db } from '../db'

export type Tenant = {
  id: string
  slug: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  settings: Record<string, unknown>
}

export const tenantMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const host = request.headers.get('host') || ''
    const subdomain = extractSubdomain(host)

    if (!subdomain) {
      return next({ context: { tenant: null } })
    }

    // Look up tenant in database
    const tenant = await db.tenant.findUnique({
      where: { slug: subdomain },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        settings: true,
      },
    })

    if (!tenant) {
      // Tenant not found, could redirect to signup or show 404
      return next({ context: { tenant: null, tenantNotFound: true } })
    }

    return next({
      context: { tenant, tenantNotFound: false },
    })
  },
)
```

## Caching Tenant Lookups

Database lookups on every request can be expensive. Add caching with a simple in-memory cache or use Redis:

```tsx
// src/middleware/tenant.ts
import { createMiddleware } from '@tanstack/react-start'
import { db } from '../db'

type Tenant = {
  id: string
  slug: string
  name: string
  plan: string
}

// Simple in-memory cache (use Redis in production for multi-instance deployments)
const tenantCache = new Map<string, { tenant: Tenant; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const now = Date.now()
  const cached = tenantCache.get(slug)

  if (cached && cached.expiresAt > now) {
    return cached.tenant
  }

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, plan: true },
  })

  if (tenant) {
    tenantCache.set(slug, {
      tenant,
      expiresAt: now + CACHE_TTL_MS,
    })
  }

  return tenant
}

export const tenantMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const host = request.headers.get('host') || ''
    const subdomain = extractSubdomain(host)

    if (!subdomain) {
      return next({ context: { tenant: null } })
    }

    const tenant = await getTenantBySlug(subdomain)

    return next({
      context: { tenant, tenantNotFound: !tenant },
    })
  },
)
```

For Redis caching:

```tsx
// src/middleware/tenant.ts
import { createMiddleware } from '@tanstack/react-start'
import { redis } from '../redis'
import { db } from '../db'

const CACHE_TTL_SECONDS = 300 // 5 minutes

async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const cacheKey = `tenant:${slug}`

  // Try cache first
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }

  // Lookup in database
  const tenant = await db.tenant.findUnique({
    where: { slug },
  })

  if (tenant) {
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(tenant))
  }

  return tenant
}
```

## Type-Safe Tenant Context

Register the tenant context type for full type safety across your application:

```tsx
// src/types/context.ts
import type { Tenant } from '../middleware/tenant'

export type TenantContext = {
  tenant: Tenant | null
  tenantNotFound?: boolean
}

// Register with TanStack Start
declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: TenantContext
    }
  }
}
```

## Access Tenant in Route Loaders

Use the `beforeLoad` hook to access tenant context and pass it to child routes:

```tsx
// routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { TenantContext } from '../types/context'

export const Route = createRootRouteWithContext<TenantContext>()({
  component: RootComponent,
})

function RootComponent() {
  return <Outlet />
}
```

```tsx
// routes/_tenant.tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

// Layout route for tenant-scoped pages
export const Route = createFileRoute('/_tenant')({
  beforeLoad: async ({ context }) => {
    // Redirect if tenant not found
    if (context.tenantNotFound) {
      throw redirect({ to: '/tenant-not-found' })
    }

    // Redirect to main site if no tenant
    if (!context.tenant) {
      throw redirect({ to: '/' })
    }

    // Pass tenant to child routes
    return { tenant: context.tenant }
  },
  component: TenantLayout,
})

function TenantLayout() {
  const { tenant } = Route.useRouteContext()

  return (
    <div>
      <header>
        <h1>{tenant.name}</h1>
      </header>
      <Outlet />
    </div>
  )
}
```

```tsx
// routes/_tenant/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_tenant/dashboard')({
  loader: async ({ context }) => {
    // Access tenant from context
    const { tenant } = context

    // Load tenant-specific data
    const dashboardData = await loadDashboardData(tenant.id)

    return { dashboardData }
  },
  component: Dashboard,
})

function Dashboard() {
  const { tenant } = Route.useRouteContext()
  const { dashboardData } = Route.useLoaderData()

  return (
    <div>
      <h2>{tenant.name} Dashboard</h2>
      {/* Render dashboard */}
    </div>
  )
}
```

## Handling Unknown Tenants

When a subdomain does not match a known tenant, you have several options:

### Option 1: Show a 404 Page

```tsx
// routes/_tenant.tsx
export const Route = createFileRoute('/_tenant')({
  beforeLoad: async ({ context }) => {
    if (context.tenantNotFound) {
      throw notFound()
    }
    return { tenant: context.tenant }
  },
})
```

### Option 2: Redirect to Signup

```tsx
// routes/_tenant.tsx
export const Route = createFileRoute('/_tenant')({
  beforeLoad: async ({ context, location }) => {
    if (context.tenantNotFound) {
      // Extract subdomain for pre-filling signup
      const subdomain = new URL(location.href).hostname.split('.')[0]
      throw redirect({
        to: '/signup',
        search: { workspace: subdomain },
      })
    }
    return { tenant: context.tenant }
  },
})
```

### Option 3: Show a Custom Error Page

```tsx
// routes/_tenant.tsx
export const Route = createFileRoute('/_tenant')({
  beforeLoad: async ({ context }) => {
    if (context.tenantNotFound) {
      throw redirect({ to: '/workspace-not-found' })
    }
    return { tenant: context.tenant }
  },
})
```

```tsx
// routes/workspace-not-found.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/workspace-not-found')({
  component: WorkspaceNotFound,
})

function WorkspaceNotFound() {
  return (
    <div>
      <h1>Workspace Not Found</h1>
      <p>
        The workspace you are looking for does not exist or may have been
        deleted.
      </p>
      <a href="https://example.com/signup">Create a new workspace</a>
    </div>
  )
}
```

## Complete Multi-Tenant Example

Here is a complete example putting all the pieces together:

```tsx
// src/middleware/tenant.ts
import { createMiddleware } from '@tanstack/react-start'
import { db } from '../db'

export type Tenant = {
  id: string
  slug: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  logoUrl: string | null
  primaryColor: string
}

export type TenantContext = {
  tenant: Tenant | null
  tenantNotFound: boolean
}

const tenantCache = new Map<string, { tenant: Tenant; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

function extractSubdomain(host: string): string | null {
  if (host.includes('localhost')) {
    const match = host.match(/^([^.]+)\.localhost/)
    return match ? match[1] : null
  }

  const parts = host.split('.')
  if (parts.length >= 3 && !['www', 'api', 'app'].includes(parts[0])) {
    return parts[0]
  }

  return null
}

async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const now = Date.now()
  const cached = tenantCache.get(slug)

  if (cached && cached.expiresAt > now) {
    return cached.tenant
  }

  const tenant = await db.tenant.findUnique({
    where: { slug },
  })

  if (tenant) {
    tenantCache.set(slug, { tenant, expiresAt: now + CACHE_TTL_MS })
  }

  return tenant
}

export const tenantMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const host = request.headers.get('host') || ''
    const subdomain = extractSubdomain(host)

    if (!subdomain) {
      return next({
        context: {
          tenant: null,
          tenantNotFound: false,
        },
      })
    }

    const tenant = await getTenantBySlug(subdomain)

    return next({
      context: {
        tenant,
        tenantNotFound: !tenant,
      },
    })
  },
)
```

```tsx
// src/start.ts
import { createStart } from '@tanstack/react-start'
import { tenantMiddleware } from './middleware/tenant'

export const startInstance = createStart(() => ({
  requestMiddleware: [tenantMiddleware],
}))
```

```tsx
// routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { TenantContext } from '../middleware/tenant'

export const Route = createRootRouteWithContext<TenantContext>()({
  component: () => <Outlet />,
})
```

```tsx
// routes/_tenant.tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_tenant')({
  beforeLoad: ({ context }) => {
    if (context.tenantNotFound) {
      throw redirect({ to: '/workspace-not-found' })
    }
    if (!context.tenant) {
      throw redirect({ to: '/' })
    }
    return { tenant: context.tenant }
  },
  component: TenantLayout,
})

function TenantLayout() {
  const { tenant } = Route.useRouteContext()

  return (
    <div
      style={{ '--primary-color': tenant.primaryColor } as React.CSSProperties}
    >
      <header>
        {tenant.logoUrl && <img src={tenant.logoUrl} alt={tenant.name} />}
        <h1>{tenant.name}</h1>
        <span>Plan: {tenant.plan}</span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
```

```tsx
// routes/_tenant/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_tenant/')({
  loader: async ({ context }) => {
    const stats = await loadTenantStats(context.tenant.id)
    return { stats }
  },
  component: TenantHome,
})

function TenantHome() {
  const { tenant } = Route.useRouteContext()
  const { stats } = Route.useLoaderData()

  return (
    <div>
      <h2>Welcome to {tenant.name}</h2>
      <div>
        <p>Users: {stats.userCount}</p>
        <p>Projects: {stats.projectCount}</p>
      </div>
    </div>
  )
}
```

## Development Setup

For local development, you can use subdomains with localhost. Update your `/etc/hosts` file:

```
127.0.0.1 acme.localhost
127.0.0.1 globex.localhost
```

Or configure your development server to support wildcard subdomains. Some tools like [nip.io](https://nip.io) provide wildcard DNS for development:

- `acme.127.0.0.1.nip.io:3000`
- `globex.127.0.0.1.nip.io:3000`

## Related Resources

- [Middleware](./middleware) for middleware composition patterns
- [Authentication](./authentication) for combining auth with multi-tenancy
- [Server Entry Point](./server-entry-point) for request context registration
