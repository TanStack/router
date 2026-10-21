/**
 * Split route options rendered by a real router in a real build: the
 * error, not-found and pending components load from their own chunks and
 * render where the router needs them.
 */
import { describe, expect, test } from 'vitest'
import { build, head } from '../build-harness'
import type { BuildEnv } from '@tanstack/compiler-test-utils/build-harness'

const rootRoute = `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`

const routes = {
  'routes/__root.tsx': rootRoute,
  'routes/error.tsx': `${head}export const Route = createFileRoute('/error')({
  loader: () => {
    throw new Error('failed')
  },
  component: () => <p>page</p>,
  errorComponent: () => <p>{'MARK_ERROR'}</p>,
})
`,
  'routes/missing.tsx': `${head}import { notFound } from '@tanstack/react-router'
export const Route = createFileRoute('/missing')({
  loader: () => {
    throw notFound()
  },
  component: () => <p>page</p>,
  notFoundComponent: () => <p>{'MARK_NOT_FOUND'}</p>,
})
`,
  'routes/pending.tsx': `${head}export const Route = createFileRoute('/pending')({
  loader: () => new Promise(() => {}),
  pendingMs: 0,
  component: () => <p>page</p>,
  pendingComponent: () => <p>{'MARK_PENDING'}</p>,
})
`,
}

/**
 * `renderAt(path, text)` renders the app at `path` and returns its HTML:
 * on the client once it shows `text` (or after 2 seconds), on the server
 * once the router loaded.
 */
const entries: Record<BuildEnv, string> = {
  client: `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function renderAt(path: string, text: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(createElement(RouterProvider, { router })))
  for (let tries = 0; tries < 200 && !container.innerHTML.includes(text); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const html = container.innerHTML
  root.unmount()
  container.remove()
  return html
}
`,
  ssr: `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  return renderToString(createElement(RouterProvider, { router }))
}
`,
}

const cases = {
  client: [
    { path: '/error', marker: 'MARK_ERROR' },
    { path: '/missing', marker: 'MARK_NOT_FOUND' },
    { path: '/pending', marker: 'MARK_PENDING' },
  ],
  // A server render waits for the loaders, so it never shows a pending
  // component.
  ssr: [
    { path: '/error', marker: 'MARK_ERROR' },
    { path: '/missing', marker: 'MARK_NOT_FOUND' },
  ],
}

describe.each(['client', 'ssr'] as const)('a Vite %s build', (env) => {
  test('renders split error, not-found and pending components through the router', async () => {
    const app = await build({
      bundler: 'vite',
      env,
      files: { ...routes, 'entry.ts': entries[env] },
      pluginOptions: {
        codeSplittingOptions: {
          defaultBehavior: [
            ['component'],
            ['errorComponent'],
            ['notFoundComponent'],
            ['pendingComponent'],
          ],
        },
      },
    })
    const { result } = await app.run(`const results = {}
for (const { path, marker } of ${JSON.stringify(cases[env])}) {
  results[path] = (await entry.renderAt(path, marker)).includes(marker)
}
return results`)
    expect({
      placement: Object.fromEntries(
        cases[env].map(({ marker }) => [marker, app.where(marker)]),
      ),
      rendered: result,
    }).toEqual({
      placement: Object.fromEntries(
        cases[env].map(({ marker }) => [marker, 'lazy']),
      ),
      rendered: Object.fromEntries(cases[env].map(({ path }) => [path, true])),
    })
  }, 120_000)
})

// An option value that is already lazy (`lazyRouteComponent(() =>
// import(…))`, ruling OQ13): the code splitter may leave it in the route
// module or split it and chain its preload; either way, once the router has
// preloaded the route, rendering it requests no new module and shows no
// pending fallback (SPEC J2.6). One real Vite client build in Chromium:
// the requests are the page's resource entries.
describe('an already lazy route component', () => {
  const files = {
    'routes/__root.tsx': `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
    'routes/index.tsx': `import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: lazyRouteComponent(() => import('../page')),
  pendingComponent: () => <p>MARK_PENDING</p>,
  pendingMs: 0,
})
`,
    'page.tsx': `export default function Page() {
  return <p>MARK_PAGE</p>
}
`,
    'entry.ts': `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
/** Preloads \`/\`, then renders it; what the first render shows and what loaded for it. */
export async function renderPreloaded() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.preloadRoute({ to: '/' })
  await router.load()
  const before = performance.getEntriesByType('resource').length
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(createElement(RouterProvider, { router })))
  const first = container.innerHTML
  for (let tries = 0; tries < 200 && !container.innerHTML.includes('MARK_PAGE'); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const requested = performance
    .getEntriesByType('resource')
    .slice(before)
    .map((entry) => entry.name)
  const html = container.innerHTML
  root.unmount()
  container.remove()
  return { first, html, requested }
}
`,
  }

  /** What a Vite client build of the app shows and requests (see the entry). */
  async function renderPreloaded(autoCodeSplitting: boolean) {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      files,
      pluginOptions: { autoCodeSplitting },
    })
    return (await app.run(`return await entry.renderPreloaded()`)).result
  }
  const preloaded = {
    first: '<p>MARK_PAGE</p>',
    html: '<p>MARK_PAGE</p>',
    requested: [],
  }

  // Control for the pin below: without code splitting the router's own
  // preload of the lazy component is enough.
  test('renders without a new request or a pending fallback once the router preloaded it (splitting off)', async () => {
    expect(await renderPreloaded(false)).toEqual(preloaded)
  }, 120_000)

  // Bug: the code splitter moves the already lazy value into a chunk of its
  // own, so the route's component is a lazy component whose module exports
  // another lazy component: the router's preload loads the outer chunk only,
  // and the first render suspends (pending fallback) and requests the page
  // module. Leaving the value in the route module or chaining the inner
  // preload both fix it (ruling OQ13).
  // Source: SPEC §6 OQ13 (coordinator ruling 2026-10-18).
  // Impact: apps that already wrap a route component in
  // lazyRouteComponent show their pending component, and wait for a
  // request, on every navigation the router had preloaded (intent
  // preloading no longer avoids the waterfall).
  test.fails(
    'renders without a new request or a pending fallback once the router preloaded it',
    async () => {
      expect(await renderPreloaded(true)).toEqual(preloaded)
    },
    120_000,
  )
})
