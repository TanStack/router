# RSC-style server components on Remix 3

> Status: design + runtime prototype. Build-plugin integration is a follow-up.

This is the bundle-size lever I want to pull instead of `<Frame>`-based content fetching: keep full client hydration, keep the SPA navigation feel, but stop shipping route component code for components that only render data. The client bundle ships the runtime, the binding, and the *interactive* primitives; everything else is rendered server-side and arrives as a serialized VDOM payload.

It's the same shape as React Server Components — adapted to Remix 3's primitives.

## Why this shape

- **Full hydration is the contract.** The client owns the same router, history, store atoms, and reactivity as before. Navigation is still client-driven via the router; nothing about the developer model changes.
- **Bundle wins come from omission.** Server components are the things that aren't shipped. Static templates of loader data — which are most route components in most apps — disappear from the client bundle.
- **Built on existing Remix 3 primitives.** Three pieces are already there:
  1. `clientEntry()` — marks a component as needing client code. The SSR pipeline already brackets each in `<!-- rmx:h:hN -->` markers and serializes its props into the hydration payload.
  2. `createRangeRoot([start, end], …)` — mounts a `remix/ui` root bounded by two DOM nodes. Lets us replace a marker-bracketed range without re-mounting the whole tree.
  3. `crossSerializeStream` (seroval, already used by the dehydration script) — streams serializable values from server to client.

The new bit is the **inverse** of `clientEntry()`: a `serverComponent()` marker that opts a component *out* of the client bundle and tells the server to record the component's identity + serialized props in the SSR payload. The client doesn't load the module; instead, when the server-component's input changes (e.g., loader data invalidated), the runtime fetches a re-render from the server and uses `createRangeRoot` to replace the bracketed range.

## API

```tsx
import { serverComponent } from '@tanstack/remix-router'
import type { Handle } from '@remix-run/ui'

// A server-only component. Body never ships to the client bundle.
export const UserCard = serverComponent(
  '@/components/UserCard',
  function UserCard(handle: Handle<{ userId: number }>) {
    // Loaders / DB calls are fine here — this only runs on the server.
    return ({ userId }) => {
      const user = lookupUser(userId)
      return (
        <article>
          <h2>{user.name}</h2>
          <p>{user.bio}</p>
        </article>
      )
    }
  },
)

// A client component. Body ships and hydrates as today.
export const FollowButton = clientEntry(
  '@/components/FollowButton',
  function FollowButton(handle: Handle<{ userId: number }>) {
    let following = false
    return ({ userId }) => (
      <button mix={[on('click', async () => {
        await follow(userId)
        following = true
        handle.update()
      })]}>
        {following ? 'Following' : 'Follow'}
      </button>
    )
  },
)
```

A typical route component composes both:

```tsx
function UserPage(handle: Handle) {
  const data = useLoaderData(handle, { from: '/users/$id' })
  return () => (
    <main>
      <UserCard userId={data().id} />     {/* server component */}
      <FollowButton userId={data().id} /> {/* client island */}
    </main>
  )
}
```

The route component itself ships (it threads loader data into props, drives the UI). `UserCard`'s body does not. `FollowButton`'s body does, hydrated as an island.

## Server pipeline (what changes vs. today)

`createRouterHandler` already attaches `router.serverSsr`, calls `dehydrate()`, and pipes the seroval stream into a `<script>` before `</body>`. Server components piggyback on the same pipeline:

1. During render, when a `serverComponent`-marked component is encountered, the SSR pipeline:
   - Renders the component normally to HTML
   - Brackets the output with `<!-- rmx:s:sN --> … <!-- /rmx:s -->`
   - Serializes `{ id: serverComponentId, props }` into a section of the SSR payload keyed by `sN` (mirrors how `clientEntry` records `{ entryId, exportName, props }`).
2. After render, the dehydration script written to the document includes a `s` section alongside the existing `h` (clientEntry) section:
   ```js
   $_TSR.serverComponents = { sN: { id: '@/components/UserCard', props: { userId: 7 } } }
   ```

Total runtime cost on the server: one extra map per render, ~5 lines.

## Client pipeline (the partial-update path)

The client runtime ships:

1. The marker walker that finds `<!-- rmx:s:sN -->` ranges in the DOM and indexes them by `sN`.
2. A fetch helper:
   ```ts
   async function reRenderServerComponent(sN: string, nextProps: unknown) {
     const res = await fetch(`/_serverComponent/${sN}`, {
       method: 'POST',
       body: JSON.stringify(nextProps),
     })
     const html = await res.text()
     const range = ranges.get(sN)        // [startComment, endComment]
     const root = createRangeRoot(range) // remix/ui primitive
     root.render(rawHtml(html))          // see "open question 1" below
   }
   ```
3. Hooks into `router.subscribe('onLoad', …)`: when a route's loader data changes, walk the active matches' server components, call `reRenderServerComponent` for each one whose props depend on the changed match.

The fetch endpoint is registered by the server adapter:
- Path: `${serverComponentBase}/${sN}` (default `/_sc/`)
- Method: `POST`
- Body: JSON-encoded props
- Response: HTML chunk (the bracketed range's new content)

The endpoint is plumbed through the same `createStartHandler` (or `createRouterHandler` in the router-only case), routed before the catch-all match handler — same pattern as `${serverFnBase}/<id>` routing for `createServerFn`.

## What ships to the client

A typical route page has three categories of code:

| Category | Pre-RSC bundle | Post-RSC bundle |
|---|---|---|
| Runtime (`@remix-run/ui`, router-core, binding) | ✅ ships | ✅ ships |
| Route component (loader-data templating) | ✅ ships | ✅ ships *(orchestrates server/client children)* |
| Server-only subtrees (formatting, layout) | ✅ ships | ❌ does **not** ship |
| `clientEntry` islands (interactive forms, buttons) | ✅ ships | ✅ ships |

For a content-heavy app, the "server-only subtrees" bucket is the majority of route component code. Cutting it from the bundle is the win.

## Open questions before this is real

1. **Re-render delivery format.** Today I'm leaning HTML (the server runs `renderToStream` for the bracketed component, returns the resulting markup). The client uses `createRangeRoot` to swap. Easier than VDOM serialization; loses some efficiency on diffs because the client doesn't have the prior VNode tree. Likely fine for v1.
2. **Build-plugin support to actually exclude server bodies.** The runtime contract works without it (a `serverComponent`-marked component just runs server-side via SSR). To actually *cut bundle size* we need a Vite plugin that:
   - Detects `serverComponent('id', fn)` calls
   - Replaces the body with a stub that renders `<!-- rmx:s:sN -->` markers + dispatches re-render fetches on prop changes
   - Excludes the original body from client chunks (rolldown already supports `import.meta.env.SSR` pruning; we'd lean on that)
3. **Coupling to router-core invalidation.** The client needs to know which server-component instances depend on which match — easiest when the server emits that mapping in the payload. Otherwise the client conservatively re-fetches all of them on any loader update.
4. **Auth / context.** The re-render endpoint needs to run with the same request context (sessions, auth) as the original render. Mounting it under the same fetch-router app gets us this for free; documented in the design.

## Phases

1. **Runtime contract** (this PR): `serverComponent()` marker, SSR payload section, `/_sc/<id>` endpoint, client-side range swap. Without the build plugin, server bodies still ship — but the *infrastructure* is there.
2. **Vite plugin** (follow-up): detect `serverComponent` calls, exclude bodies from client bundles, emit per-component re-render endpoints in the manifest.
3. **Match-aware invalidation**: emit `dependsOn: [matchId]` per server component so the client only re-fetches affected ones on navigation.
4. **Streaming re-renders**: drop the buffered HTML response in favor of `renderToStream` for the bracketed component, with the response body streaming server-component HTML chunks. Useful for components that themselves contain `<Frame>` children or deferred data — though we're leaving framing alone, so this is mostly future-proofing.

The goal is for a typical CRUD app to drop ~30% of its client bundle by reducing route components to "loader-data templating + client islands" with everything else server-only. We'll measure on the example app at the end of Phase 2.
