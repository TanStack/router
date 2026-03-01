---
title: "Multi-Tenancy in TanStack Start: A Simple Guide"
description: "Learn how to structure a multi-tenant app using TanStack Start with React."
---
**Full Source Code** [View the complete repo on GitHub](https://www.google.com/search?q=https://github.com/harshG775/tanstack-start-multi-tenant-example)


# Multi-Tenancy in TanStack Start: Subdomain & Hostname Routing

Building a SaaS usually requires identifying a tenant by their **subdomain** or **hostname**. Because **TanStack Start** is built on top of Nitro and Vinxi, we have powerful server-side utilities to handle this during the SSR (Server-Side Rendering) phase.

---

## 1. Normalize the Hostname

In production, you'll have `tenant.com` or `user.saas.com`. In development, you likely have `localhost:3000`. This utility ensures your logic stays consistent across environments.

```ts
// lib/normalizeHostname.ts
export const normalizeHostname = (hostname: string): string => {
    // Handle local development subdomains like tenant.localhost:3000
    if (hostname.includes("localhost")) {
        return hostname.replace(".localhost", "").split(":")[0]
    }
    return hostname
}

```

## 2. Identify the Tenant (Server Function)

We use `createServerOnlyFn` to ensure our tenant lookup—which might involve a database call or a secret API key—never leaks to the client. We use `getRequestUrl()` from the Start server utilities to grab the incoming URL.

```ts
// serverFn/tenant.serverFn.ts
import { getTenantConfigByHostname } from "#/lib/api"
import { normalizeHostname } from "#/lib/normalizeHostname"
import { createServerOnlyFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"

export const getTenantConfig = createServerOnlyFn(async () => {
    const url = getRequestUrl()
    const hostname = normalizeHostname(url.hostname)

    const tenantConfig = await getTenantConfigByHostname({ hostname })

    if (!tenantConfig) {
        // You can throw a 404 here, or return null to handle it in the UI
        throw new Response("Tenant Not Found", { status: 404 })
    }

    return tenantConfig
})

```

## 3. Register in the Root Loader

The best place to fetch tenant data is the `__root__` route. This ensures the data is resolved **once** at the top level and is available to every child route and the HTML `<head>`.

```tsx
// routes/__root.tsx
import { getTenantConfig } from "#/serverFn/tenant.serverFn"

export const Route = createRootRoute({
    loader: async () => {
        try {
            const tenantConfig = await getTenantConfig()
            return { tenantConfig }
        } catch (error) {
            // Handle cases where the tenant doesn't exist
            return { tenantConfig: null }
        }
    },
    // ...
})

```

## 4. Dynamic Metadata & UI

One of the biggest benefits of this approach is SEO. You can dynamically update the page title, favicon, and Open Graph tags based on the tenant.

### Updating the `<head>`

```tsx
// routes/__root.tsx
export const Route = createRootRoute({
    head: (ctx) => {
        const tenant = ctx.loaderData?.tenantConfig

        return {
            meta: [
                { title: tenant?.meta.name ?? "Default App" },
                { name: "description", content: tenant?.meta.description },
                { property: "og:image", content: tenant?.meta.logo },
            ],
            links: [
                { rel: "icon", href: tenant?.meta.favicon ?? "/favicon.ico" },
            ],
        }
    },
})

```

### Using Tenant Data in Components

Access the data anywhere using `useLoaderData` from the root.

```tsx
// routes/index.tsx
import { createFileRoute, useLoaderData } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
    component: HomePage,
})

function HomePage() {
    const { tenantConfig } = useLoaderData({ from: "__root__" })

    if (!tenantConfig) return <h1>404: Tenant Not Found</h1>

    return (
        <main className="p-6">
            <img src={tenantConfig.meta.logo} alt="Logo" width={100} />
            <h1>Welcome to {tenantConfig.meta.name}</h1>
        </main>
    )
}

```

---

##  Pro-Tips for Multi-Tenancy

* **Caching:** Wrap your `getTenantConfigByHostname` in a cache (like `React.cache` or a Redis layer) to avoid hitting your database on every single page load.
* **Security:** Always validate that the identified tenant is active and not suspended before returning the config.
* **Assets:** If you use a CDN, ensure your image paths are absolute or prefixed correctly to avoid cross-domain loading issues.

---