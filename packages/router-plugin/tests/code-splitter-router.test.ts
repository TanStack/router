/**
 * Split route options rendered by a real router in a real build: the
 * error, not-found and pending components load from their own chunks and
 * render where the router needs them.
 */
import { describe, expect, test } from 'vitest'
import { build } from './build-harness'
import { head } from './regression-helpers'
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
