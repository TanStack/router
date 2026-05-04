/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createRoute, useLoaderData } from '@tanstack/remix-router'
import { Frame } from '@remix-run/ui'
import { listPosts } from '../server/posts'
import { renderPostBody } from '../server/renderers'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

interface PostStub {
  slug: string
  title: string
}

/**
 * Streaming demo. Each post body is rendered inside a non-blocking
 * `<Frame src="…" fallback={…}>` — the document shell + the post-list
 * + the per-post fallback skeletons stream to the user immediately,
 * then each frame's real HTML lands as a `<template id="…">` chunk
 * and the client runtime swaps it into place. Out-of-order multiplex
 * is automatic — multiple frames race in parallel.
 *
 * The Frame `src` points at the server function's RPC URL, computed
 * via `renderPostBody.url(...)`. The router handler's `resolveFrame`
 * recurses through the Start handler, which dispatches the URL to
 * `handleServerAction` — same path the client-side RPC fetcher takes.
 * Heavy markdown rendering happens server-side; the client bundle
 * never imports `marked` / `highlight.js`.
 */
function StreamingDemo(handle: Handle) {
  const data = useLoaderData(handle, { from: '/streaming' })
  return () => {
    const posts = (data() as Array<PostStub>) ?? []
    return (
      <main>
        <h1>Streaming demo</h1>
        <p>
          Each post body below renders inside a non-blocking{' '}
          <code>&lt;Frame&gt;</code>. The fallback skeleton ships in the
          initial document; the rendered markdown swaps in as each frame
          resolves. Slow or cached frames don't block the others.
        </p>
        {posts.map((p) => (
          <Frame
            key={p.slug}
            src={renderPostBody.url(p.slug)}
            fallback={
              <article>
                <h2>{p.title}</h2>
                <p style={{ opacity: 0.6 }}>
                  <em>Loading post body…</em>
                </p>
              </article>
            }
          />
        ))}
      </main>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/streaming',
  loader: () => listPosts(),
  component: StreamingDemo,
})
