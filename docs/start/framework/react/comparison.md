---
title: Comparison | TanStack Start vs Next.js vs React Router
toc: false
---

Choosing a full-stack React framework? This comparison focuses on the **full-stack framework features** that distinguish TanStack Start from Next.js and React Router (v7 Framework Mode).

> **🚨 IMPORTANT: Looking for routing features?**
>
> TanStack Start is built on **TanStack Router**, which provides industry-leading type-safe routing capabilities. For a comprehensive comparison of routing features (nested routes, search params, type safety, loaders, etc.), please see:
>
> ### [📖 TanStack Router Comparison vs React Router / Next.js →](/router/latest/docs/framework/react/comparison)
>
> That comparison covers all the routing features in detail. This page focuses specifically on **full-stack framework capabilities** like SSR, server functions, middleware, deployment, and more.

While we aim to provide an accurate and fair comparison, please note that this table may not capture every nuance or recent update of each framework. We recommend reviewing the official documentation and trying out each solution to make the most informed decision for your specific use case.

If you find any discrepancies or have suggestions for improvement, please don't hesitate to contribute via the "Edit this page on GitHub" link at the bottom of this page or open an issue in the [TanStack Router GitHub repository](https://github.com/TanStack/router).

Feature/Capability Key:

- ✅ 1st-class, built-in, and ready to use with no added configuration or code
- 🟡 Partial Support (rated 1-5 where noted)
- 🟠 Supported via addon/community package
- 🔶 Possible, but requires custom code/implementation/casting
- 🛑 Not officially supported

|                                                                   | TanStack Start                                   | Next.js [_(Website)_][nextjs]                 | React Router [_(Website)_][react-router]   |
| ----------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------ |
| Github Repo / Stars                                               | [![][stars-tanstack-router]][gh-tanstack-router] | [![][stars-nextjs]][gh-nextjs]                | [![][stars-react-router]][gh-react-router] |
| Bundle Size                                                       | [![][bp-tanstack-router]][bpl-tanstack-router]   | ❓                                            | ❓                                         |
| --                                                                | --                                               | --                                            | --                                         |
| **Routing Features** [_(See Full Comparison)_][router-comparison] | ✅ Built on TanStack Router                      | ✅ File-based App Router                      | ✅ File-based Nested Routes                |
| --                                                                | --                                               | --                                            | --                                         |
| **Full-Stack Features**                                           | --                                               | --                                            | --                                         |
| SSR                                                               | ✅                                               | ✅                                            | ✅                                         |
| Streaming SSR                                                     | ✅                                               | ✅                                            | ✅                                         |
| Selective SSR (per-route)                                         | ✅                                               | 🔶                                            | 🔶                                         |
| SPA Mode                                                          | ✅                                               | 🔶 (via "use client")                         | ✅                                         |
| Built-in Client-Side SWR Caching                                  | ✅ (via TanStack Router)                         | 🔶 (fetch cache only)                         | 🛑                                         |
| Data Fetching Library Integration                                 | ✅ (Official TanStack Query, Apollo, etc.)       | 🔶 (manual integration)                       | 🔶 (manual integration)                    |
| Static Prerendering (SSG)                                         | ✅                                               | ✅                                            | ✅                                         |
| Incremental Static Regeneration (ISR)                             | ✅ (via Cache-Control headers)                   | ✅ (Proprietary)                              | ✅ (via Cache-Control headers)             |
| React Server Components                                           | 🛑 (In active development)                       | ✅                                            | 🟡 (Experimental)                          |
| Server Functions                                                  | ✅ (RPC-based)                                   | ✅ (Server Actions)                           | ✅ (Actions)                               |
| Server Function Client Middleware                                 | ✅                                               | 🛑                                            | 🛑                                         |
| Server Function Server Middleware                                 | ✅                                               | 🛑                                            | ✅                                         |
| Request Middleware (All Routes)                                   | ✅                                               | ✅                                            | ✅                                         |
| Server Function Input Validation                                  | ✅                                               | 🔶 (manual)                                   | 🔶 (manual)                                |
| API Routes / Server Routes / Resource Routes                      | ✅                                               | ✅                                            | ✅                                         |
| `<Form>` API                                                      | 🛑                                               | 🟠 (via React 19 useActionState)              | ✅                                         |
| --                                                                | --                                               | --                                            | --                                         |
| **Developer Experience**                                          | --                                               | --                                            | --                                         |
| Devtools                                                          | ✅                                               | 🛑                                            | 🟠 (3rd party)                             |
| CLI Tooling                                                       | ✅                                               | ✅                                            | ✅                                         |
| Dev Server Startup Speed                                          | ✅ (Fast)                                        | 🛑 (Slow)                                     | ✅ (Fast)                                  |
| HMR Speed                                                         | ✅ (Fast, Vite)                                  | 🛑 (Slow, Webpack/Turbopack)                  | ✅ (Fast, Vite)                            |
| Dev Navigation Speed                                              | ✅                                               | 🟡                                            | ✅                                         |
| Dev Resource Usage (CPU/RAM)                                      | ✅ (Lightweight)                                 | 🛑 (Heavy)                                    | ✅ (Lightweight)                           |
| TypeScript Support                                                | ✅                                               | ✅                                            | ✅                                         |
| Type-First Architecture                                           | ✅                                               | 🛑                                            | 🛑                                         |
| --                                                                | --                                               | --                                            | --                                         |
| **Deployment & Hosting**                                          | --                                               | --                                            | --                                         |
| Deployment Flexibility                                            | ✅ (Any Vite-compatible host)                    | 🟡 (Optimized for Vercel, possible elsewhere) | ✅ (Multiple adapters)                     |
| Edge Runtime Support                                              | ✅                                               | ✅                                            | ✅                                         |
| Serverless Support                                                | ✅                                               | ✅                                            | ✅                                         |
| Node.js Support                                                   | ✅                                               | ✅                                            | ✅                                         |
| Docker Support                                                    | ✅                                               | ✅                                            | ✅                                         |
| Static Export                                                     | ✅                                               | ✅                                            | ✅                                         |
| Official Cloudflare Support                                       | ✅                                               | 🟡                                            | ✅                                         |
| Official Netlify Support                                          | ✅                                               | 🟡                                            | ✅                                         |
| Official Vercel Support                                           | ✅ (via Nitro)                                   | ✅                                            | ✅                                         |

---

> **⚠️ Remember:** For detailed comparisons of **routing features** (type safety, search params, loaders, navigation, etc.), see the [**TanStack Router Comparison**][router-comparison]. This page focuses on full-stack framework capabilities.

---

## Key Philosophical Differences

### TanStack Start

**Philosophy**: Maximum developer freedom with best-in-class type safety.

- **Router-First**: Built on TanStack Router (see [full routing comparison][router-comparison])
- **Deployment Agnostic**: Built on Vite, deploy anywhere without vendor lock-in
- **Composable Middleware**: Middleware system works at both the request level AND individual server function level (both client & server)
- **Selective SSR**: Fine-grained control over SSR behavior per route (full SSR, data-only, or client-only)
- **Developer Control**: Explicit, composable patterns over convention-based magic
- **Type Safety First**: End-to-end compile-time safety for server functions, loaders, and routing

### Next.js

**Philosophy**: Production-ready with optimal defaults, best with Vercel.

- **RSC-First**: Deep integration with React Server Components as the primary paradigm
- **Vercel-Optimized**: Best performance and DX on Vercel's infrastructure
- **Convention over Configuration**: Opinionated structure with file-system routing conventions
- **Automatic Optimizations**: Many performance optimizations happen automatically
- **Production Grade**: Battle-tested at massive scale

### React Router (v7 Framework Mode)

**Philosophy**: Web fundamentals with progressive enhancement.

- **Web Standards**: Embraces web platform primitives (fetch, FormData, Headers)
- **Progressive Enhancement**: Works without JavaScript by default
- **Nested Routes**: First-class support for nested routing and data loading
- **Action-Based**: Form submissions via actions follow web standards
- **Framework Evolution**: Successor to Remix, with Vite-based architecture

## When to Choose Each Framework

### Choose TanStack Start if you:

- Want the absolute best type safety for routing (see [Router Comparison][router-comparison])
- Need deployment flexibility without vendor lock-in (works with any Vite-compatible host)
- Prefer composable, explicit patterns over convention
- Want fine-grained control over SSR behavior (selective SSR per route)
- Need composable middleware that works at both request and server function levels
- Are building a complex application that benefits from TanStack Router's advanced features
- Already use TanStack Query or other TanStack libraries

### Choose Next.js if you:

- Want to use React Server Components today with full ecosystem support
- Are deploying to Vercel or want a Vercel-optimized experience
- Prefer convention over configuration for faster initial development
- Want automatic image optimization and font loading

### Choose React Router if you:

- Prioritize progressive enhancement
- Want your app to work without JavaScript
- Prefer action-based mutations following web conventions

## Feature Deep Dives

### Built-in Client-Side Caching

**TanStack Start** includes powerful built-in SWR (stale-while-revalidate) caching through TanStack Router:

- **Out-of-the-box performance** - Loader data is automatically cached and revalidated
- **Fine-grained control** - Configure `staleTime`, `gcTime`, and revalidation per route
- **Structural sharing** - Efficient updates that only re-render what changed
- **Official integrations** - Turn-key support for TanStack Query, Apollo, and other data fetching libraries
- **More performant** - Optimized for the user experience with instant navigation and background updates

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  staleTime: 10_000, // Consider fresh for 10 seconds
  gcTime: 5 * 60_000, // Keep in memory for 5 minutes
})
```

For advanced scenarios, TanStack Start integrates seamlessly with TanStack Query:

```tsx
import { queryOptions } from '@tanstack/react-query'

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
  })

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(postQueryOptions(params.postId)),
})

function Post() {
  const { postId } = Route.useParams()
  const { data } = useQuery(postQueryOptions(postId))
  // Automatically uses cached data from loader
}
```

**Next.js** has basic fetch caching but lacks fine-grained control and requires manual integration with libraries like React Query.

**React Router** doesn't have built-in client-side caching - you need to manually integrate a caching solution.

### Server Functions vs Server Actions

**TanStack Start Server Functions**:

```tsx
export const getTodos = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(z.object({ userId: z.string() })))
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    // Fully typed data and context
    return db.todos.findMany({ where: { userId: data.userId } })
  })

// Call from anywhere with full type safety
const todos = await getTodos({ data: { userId: '123' } })
```

**Next.js Server Actions**:

```tsx
'use server'
export async function getTodos(userId: string) {
  // Runs on server, called from client
  return db.todos.findMany({ where: { userId } })
}

// Call from client component
const todos = await getTodos('123')
```

Key differences:

- Start's server functions support both client and server middleware
- Start has built-in input validation
- Start's approach is more explicit about the client/server boundary
- Next.js Server Actions integrate more seamlessly with forms

### Middleware Architecture

**TanStack Start** has two types of middleware:

1. **Request Middleware**: Runs for all requests (SSR, API routes, server functions)
2. **Server Function Middleware**: Runs specifically for server functions, supports both client-side and server-side execution

This composability allows for:

```tsx
const authMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    // Run auth checks on client
    return next({
      headers: { Authorization: `Bearer ${getToken()}` },
    })
  })
  .server(async ({ next }) => {
    // Validate auth on server
    return next({ context: { user: await getUser() } })
  })
```

**Next.js** has a single middleware.ts file that runs on the Edge Runtime for all requests. It cannot access server-only resources like databases and has limitations compared to the Node.js runtime.

### Deployment Flexibility

**TanStack Start** leverages Vite's ecosystem:

- Deploy to Cloudflare Workers, Netlify, Vercel, Railway, Fly.io, AWS, etc.
- Use Nitro for universal deployment support
- No vendor-specific features or lock-in
- Same codebase works everywhere

**Next.js** is optimized for Vercel:

- Many features work best or only on Vercel (ISR, Image Optimization, Middleware)
- Self-hosting requires more configuration
- Deployment to other platforms may have limitations

## React Server Components (RSC)

**Current Status**:

- **Next.js**: Full production support with extensive ecosystem
- **TanStack Start**: In active development, expected soon
- **React Router**: Experimental support available

RSC is still evolving, and TanStack Start is taking time to ensure the best possible implementation that aligns with its type-safety-first philosophy.

## Performance Considerations

### Production Performance

All three frameworks are capable of achieving excellent production performance and top Lighthouse scores. The differences come down to optimization strategies:

- **TanStack Start**: Vite's optimized builds, SWR caching reduces server load, lightweight runtime
- **Next.js**: Automatic code splitting, image optimization, and built-in performance features
- **React Router**: Web standards-based caching and optimization

### Development Performance

This is where the frameworks differ significantly:

**TanStack Start & React Router:**

- ⚡ **Instant dev server startup** - Vite starts in milliseconds
- ⚡ **Lightning-fast HMR** - Changes reflect instantly without page refresh
- ⚡ **Fast dev navigation** - Full-speed routing during development
- ⚡ **Lightweight resource usage** - Minimal CPU and RAM consumption
- ⚡ **High dev throughput** - Handle many concurrent requests efficiently

**Next.js:**

- 🐌 **Slow dev server startup** - Can take many seconds to start, especially on larger projects
- 🐌 **Slow HMR** - Hot reloading is noticeably sluggish even with Turbopack
- 🐌 **Throttled dev navigation** - Navigation is artificially slowed during development
- 🐌 **Heavy resource usage** - Significant CPU and RAM consumption during development

**Why This Matters:**

Development performance directly impacts developer productivity. Faster feedback loops mean:

- More iterations per hour
- Better flow state and focus
- Lower machine requirements
- Reduced frustration during development
- Faster CI/CD pipelines for development builds

While Next.js's production performance is excellent, the development experience can be notably slower, especially on larger codebases or less powerful machines.

## Community and Ecosystem

- **Next.js**: Largest community, most third-party integrations, extensive learning resources
- **React Router**: One of the oldest and most widely used React libraries, strong community, excellent documentation
- **TanStack Start**: Growing community, part of TanStack ecosystem, excellent Discord support

## Maturity

- **Next.js**: Production-ready, used by thousands of companies, proven at scale
- **React Router**: Production-ready, powers millions of apps, v7 Framework Mode is the evolution of Remix
- **TanStack Start**: Release Candidate stage, feature-complete, rapidly stabilizing toward v1

[bp-tanstack-router]: https://badgen.net/bundlephobia/minzip/@tanstack/react-router
[bpl-tanstack-router]: https://bundlephobia.com/result?p=@tanstack/react-router
[gh-tanstack-router]: https://github.com/tanstack/router
[stars-tanstack-router]: https://img.shields.io/github/stars/tanstack/router?label=%F0%9F%8C%9F
[router-comparison]: /router/latest/docs/framework/react/comparison
[_]: _
[nextjs]: https://nextjs.org/
[gh-nextjs]: https://github.com/vercel/next.js
[stars-nextjs]: https://img.shields.io/github/stars/vercel/next.js?label=%F0%9F%8C%9F
[_]: _
[react-router]: https://reactrouter.com/
[gh-react-router]: https://github.com/remix-run/react-router
[stars-react-router]: https://img.shields.io/github/stars/remix-run/react-router?label=%F0%9F%8C%9F
