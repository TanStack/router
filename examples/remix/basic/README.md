# `@tanstack/remix-router` + `@tanstack/remix-start` example

End-to-end demo of TanStack Router on top of Remix 3 (`@remix-run/ui`).
The whole route tree hydrates as one Remix UI mount; TanStack Router
drives navigation and data; server functions keep heavy server-only
work (markdown rendering, DB clients, anything you don't want shipped to
the browser) out of the client bundle.

## Architecture

```
Browser
├─ src/client.tsx
│    await hydrateStart()                 ← deserialize router state
│    run({ loadModule })                  ← Remix UI runtime (for clientEntry islands)
│    createRoot(document.body)
│      .render(<StartClient router={router}/>)   ← full-tree mount
│
├─ Server function calls ──────┐
│    GET/POST /_serverFn/<id>  │
└─ Page navigation / data fetch │
     ↓                          │
Server (vite dev → node prod)  │
└─ default-entry server          │
   createStartHandler(defaultStreamHandler)
     ↓
   renderRouterToStream → @remix-run/ui/server.renderToStream
     - <StartServer> provides shell
     - splices seroval dehydration before </body>
```

One reconciler everywhere: `@remix-run/ui`. TanStack Router subscribes
to its own reactive stores; on store change it calls `handle.update()`
and Remix UI re-runs the render function.

## The five primitives

| Primitive | When to write it | What it costs the client |
|---|---|---|
| **Route component** `function Foo(handle) { return () => <jsx/> }` | every page, layout, nav | full hydration cost |
| **Loader** `loader: () => fetchData()` | data the route needs | the loader code ships unless wrapped — use server fns |
| **`createServerFn({ method }).inputValidator().handler()`** | DB queries, markdown renders, anything with heavy deps or server-only secrets | nothing — body is stripped, replaced with RPC fetcher |
| **`clientEntry(id, fn)`** | per-instance interactive bits that don't need router context (counter, dropdown, video player) | only the island module + its props ship as a separate hydration root |
| **`<Frame src="…">`** | streaming a server-rendered fragment from a URL — opaque to the parent client tree | the URL string + ~10kB Frame runtime |

Default = universal: components run on both sides, no directives. Wrap
to opt out of the client (`createServerFn`, `<Frame>`); wrap to opt in
to standalone hydration (`clientEntry`).

## Routes

| Path | Demonstrates |
|---|---|
| `/` | Static welcome page with a route guide |
| `/users` | Loader-driven list, `<Link>` to nested detail |
| `/users/$id` | `useLoaderData` + `useParams`; server-fn-rendered HTML mounted via `innerHTML` |
| `/posts` | Same shape with markdown content |
| `/posts/$slug` | Heavy markdown + syntax highlighting (server-only deps stay out of client bundle) |
| `/admin/users/$userId/sessions/$sessionId` | 4-deep nested layout via file path; exercises `<Outlet>`/`<MatchContext>` reactivity at every level |
| `/catalog` | `validateSearch`, `loaderDeps`, `<Link search={updater}>`, form-driven `useNavigate` |
| `/slow` | Async loader (800ms), `pendingComponent` UI |
| `/lab/error` | Loader throws → `errorComponent` |
| `/lab/missing` | Loader calls `notFound()` → `notFoundComponent` |
| `/lab/render-error` | Render-time throw caught by enclosing `<CatchBoundary>` |
| `/guestbook` | `createServerFn({ method: 'POST' })` with `inputValidator`; form submit calls server fn from event handler |
| `/counter` | `clientEntry()`-marked island that hydrates standalone (counter `+`/`reset` buttons) |

## Bundle savings

The Vite plugin (`@tanstack/remix-start/plugin/vite` →
`@tanstack/start-plugin-core` under the hood) extracts `createServerFn`
handler bodies from the client bundle, replacing them with RPC
fetchers that hit `${TSS_SERVER_FN_BASE}/<id>`. Heavy server-only
modules (markdown renderers, ORM clients, image pipelines) reachable
only through those handlers fall out of the client bundle entirely.

In this example: `marked`, `highlight.js`, language grammars, and
`heavyDep` (a deliberately-fat user-bio renderer) are all server-only
— the client bundle (~190 KB minified) contains none of them.

## Hydration model

The whole route tree hydrates. There is no selective per-component
hydration — `<Link>`, `useLoaderData`, `useSearch` all work because the
ambient `<StartClient>` mount runs the route's render function on the
client. If you want a *per-instance* interactive piece that doesn't
depend on the router context (a standalone counter, a video player, a
dropdown that's reused across pages), reach for `clientEntry()`. That
pattern is rare — the route tree already gives you reactivity.

This is fundamentally different from RSC. There are no `"use client"` /
`"use server"` directives. The boundary is the wrapped *export*
(`createServerFn(...)`, `clientEntry(...)`), not a file-level marker. A
consequence: there's no built-in way to author "this region is
server-only HTML with client islands inside" inline in the JSX tree —
that pattern needs `<Frame src="…">` (URL-driven, see below) or a
separate primitive that doesn't yet exist.

## A note on `defer()` / `<Await>`

The binding ships `defer()` and `<Await>` and they SSR correctly with
the fallback inline. Two follow-up fixes are needed before the slow
chunk streams in via seroval:

1. **`awaited.tsx` server-side guard** *(done — landed in this branch)*:
   `onSettle → handle.update()` must skip on the server, since the SSR
   scheduler doesn't implement `scheduleUpdate` and the post-stream
   update was crashing the dev server.
2. **Plumb seroval streaming chunks through `pipeWithDehydration`**:
   the resolution chunk for a deferred promise is buffered server-side
   (`scriptBuffer.enqueue`) but isn't reaching the response body.
   `collectInjection()` runs once at the end of the stream after
   serialization completes; the chunk SHOULD be in the buffered
   scripts at that point, but empirically the response only contains
   the initial dehydration. Needs investigation — likely a missing
   subscribe somewhere between the seroval `onSerialize` callback and
   the `injectScript` flush, or a timing issue with the script-buffer
   barrier lift.

The `/deferred` route has been left out for now to keep the demo
green. Once (2) is fixed, restore it from git history.

## A note on `<Frame>`

`@remix-run/ui` ships a `<Frame src="…">` primitive that streams an
HTML fragment from a URL. It's powerful — multiple frames stream in
parallel out-of-order, each with its own fallback — but it solves a
narrow problem: shipping pre-rendered HTML when the renderer (e.g. a
markdown + syntax-highlighting pipeline) can't be bundled to the
client. For most apps the existing patterns cover this:

- *"Heavy server-only render → mount as HTML"* is what `/posts/$slug`
  already does: a `createServerFn` returns the HTML string, the route
  loader awaits it, the component mounts via `innerHTML`. No async URL
  builder, no `resolveFrame` plumbing.
- *"Stream multiple async values into a route"* is `defer()` /{' '}
  `<Await>` (see `/deferred`).

Reach for `<Frame>` only if you specifically need N parallel
HTML-only renders streaming independently — rare in practice. The
binding supports it; this example just doesn't teach it because the
better-fit primitives already cover the 80% case.

## Running

```sh
pnpm install
pnpm dev      # vite dev server with full SSR + SPA navigation
pnpm build    # production build (client + server bundles)
pnpm preview  # preview production build
```
