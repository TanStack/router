/**
 * Server-only "data layer" for the /posts/$slug route. Hardcoded markdown
 * (with code blocks) so we have something realistic to render through
 * `marked` + `highlight.js`. In a real app this would be a CMS / DB query.
 */

export interface Post {
  slug: string
  title: string
  body: string
}

const POSTS: Array<Post> = [
  {
    slug: 'remix-3-ship-it',
    title: 'Remix 3 just shipped — here are the bits worth caring about',
    body: `Remix 3 dropped earlier this week and the change that matters most isn't a new feature — it's the philosophy. Each subsystem ships as its own package: \`@remix-run/ui\` for rendering, \`@remix-run/fetch-router\` for HTTP routing, \`@remix-run/session\` for sessions, and so on. You compose them.

That's a different shape from what most full-stack frameworks ship. The interesting consequence: you can pick **just** \`@remix-run/ui\` and ignore everything else. Pair it with TanStack Router and you've got a routing system that doesn't depend on Remix's view of how a server should be built.

## Code-loading model

The reconciler is small — under 10kB minified — and it ships with two unusual primitives: \`clientEntry\` and \`Frame\`. Here's how a typical interactive island looks:

\`\`\`tsx
import { clientEntry, on } from '@remix-run/ui'
import type { Handle } from '@remix-run/ui'

export const Counter = clientEntry(
  '/components/Counter.js#Counter',
  function Counter(handle: Handle<{ initialCount?: number }>) {
    let count = handle.props.initialCount ?? 0
    return () => (
      <button
        type="button"
        mix={[on('click', () => {
          count++
          handle.update()
        })]}
      >
        Count is {count}
      </button>
    )
  },
)
\`\`\`

Components are factory functions: setup runs once, the returned render fn runs on every \`handle.update()\`. No fiber, no virtual scheduler — just an explicit reactivity model.

## Server-side composition

A Remix 3 \`fetch-router\` app is a \`(Request) => Response\` chain:

\`\`\`ts
import { createRouter } from '@remix-run/fetch-router'
import { createSession } from '@remix-run/session'
import { csrf } from '@remix-run/csrf-middleware'

const app = createRouter()
app.use(createSession({ secret: process.env.SESSION_SECRET! }))
app.use(csrf())
app.get('/api/users', async () => {
  const users = await db.users.findMany()
  return Response.json(users)
})
\`\`\`

That said: nothing requires you to use \`fetch-router\` if you've already got an opinionated router (TanStack does). Drop \`@remix-run/ui\` into a TanStack Router app and you get the rendering + the conventions without the framework lock-in.

## Where it lands

Think of Remix 3 the same way you think of React: a UI library, with companion packages you pick what you want from. The framework story belongs to whatever full-stack solution you build on top.`,
  },
  {
    slug: 'streaming-without-suspense',
    title: 'Streaming SSR without Suspense: the Remix 3 angle',
    body: `Streaming HTML is a great idea trapped in a React-y package. The core mechanism — *flush the document shell, then stream chunks as they resolve* — works in any reconciler that can mark and patch ranges of DOM. Remix 3's \`<Frame>\` primitive does exactly that.

## The primitive

A \`<Frame src="…" fallback={…} />\` is Remix 3's analog of React 18 Suspense, but with a URL as the boundary instead of a thrown promise:

\`\`\`tsx
import { Frame } from '@remix-run/ui'

return () => (
  <main>
    <h1>Posts</h1>
    {posts.map((p) => (
      <Frame
        key={p.slug}
        src={\`/api/post-body/\${p.slug}\`}
        fallback={<p><em>Loading…</em></p>}
      />
    ))}
  </main>
)
\`\`\`

\`renderToStream\` calls a per-render \`resolveFrame\` hook to fetch each frame's content. The hook returns either a \`string\` or a \`ReadableStream<Uint8Array>\` — and the latter case lets the framework splice another \`(Request) => Response\`'s body straight into the parent stream. Frame composition = recursive SSR through whatever handler you wire up.

## Two modes

| Mode | When | Behavior |
|---|---|---|
| Blocking | no \`fallback\` | Renderer awaits the frame before flushing the parent |
| Non-blocking | with \`fallback\` | Fallback ships immediately; real HTML streams as a \`<template>\` chunk later |

Out-of-order multiplexing falls out for free: each frame races independently, the slowest one doesn't block the rest, and the document shell ships immediately.

## Bundle savings as a side effect

A \`<Frame src="/api/post-body/x">\` referenced from the route component contributes nothing to the client bundle except the string \`'/api/post-body/x'\` and the lightweight \`Frame\` runtime. The actual rendering — markdown parser, syntax highlighter, language grammars, whatever — lives in the API endpoint's handler, which is server-only by virtue of where it's mounted.

That's the point. Where React Server Components solve "ship less to the client" with a streaming-payload protocol, an asset graph traversal, and automatic boundary inference, frames solve it with a string and a URL. Most apps don't need the protocol — they need a way to keep heavy server-only deps out of their client bundle. \`<Frame>\` does that with the simplest possible model.

## What this isn't

It isn't React Server Components. There's no streaming-payload protocol, no asset graph traversal, no automatic boundary inference. The model is simpler: explicit \`<Frame src="…">\` boundaries, plain HTML inside, full-tree client hydration for everything else.

Works for the 90% of cases that just need bundle splitting + streaming. Doesn't try to be the 100% case.`,
  },
]

export async function fetchPost(slug: string): Promise<Post | null> {
  return POSTS.find((p) => p.slug === slug) ?? null
}

export async function listPosts(): Promise<Array<Pick<Post, 'slug' | 'title'>>> {
  return POSTS.map(({ slug, title }) => ({ slug, title }))
}
