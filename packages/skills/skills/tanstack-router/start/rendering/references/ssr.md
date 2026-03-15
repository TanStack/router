# Server-Side Rendering

SSR configuration and patterns.

## Default Behavior

All routes are server-rendered by default:

```tsx
export const Route = createFileRoute('/posts')({
  loader: async () => {
    // Runs on server during initial request
    // Runs on client during client-side navigation
    return { posts: await fetchPosts() }
  },
  component: Posts,
})
```

## SSR Entry Point

```tsx
// app/ssr.tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { createRouter } from './router'

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
```

## Custom HTML Template

```tsx
// app/ssr.tsx
export default createStartHandler({
  createRouter,
})(async ({ request, router }) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>My App</title>
        ${getHeadTags()}
      </head>
      <body>
        <div id="root">${await renderToString(router)}</div>
        ${getScriptTags()}
      </body>
    </html>
  `
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  })
})
```

## Server-Only Data

```tsx
const getServerSecret = createServerFn().handler(async () => {
  // Only runs on server
  return process.env.SECRET_KEY
})

export const Route = createFileRoute('/admin')({
  loader: async () => {
    const secret = await getServerSecret()
    // secret is available during SSR
    return { hasAccess: validateSecret(secret) }
  },
})
```

## Disable SSR Per-Route

```tsx
export const Route = createFileRoute('/client-only')({
  ssr: false, // Client-side only
  component: ClientOnlyComponent,
})
```
