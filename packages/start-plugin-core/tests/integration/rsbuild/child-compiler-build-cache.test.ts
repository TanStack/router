/**
 * Rsbuild's persistent cache (`performance.buildCache`) with a child
 * compiler of the client (a worker or service-worker plugin:
 * `./worker-plugin.ts`) that, after an offline change (a pull, a branch
 * switch), newly builds a module the client compilation restores from the
 * cache. The child compiler builds its own copy: the client's restored
 * module is still checked, and the hydrated page is the one a build without
 * the cache gives.
 * Source: Astra round 4 (Rsbuild host, B1): the worker's build of the
 * route tree made the client keep its restored tree, which lacked a route
 * that had become a page ("Not Found" after a client-side navigation). Main
 * serves the page.
 */
import { expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { buildStart } from '../../build-harness'
import { rsbuildEntries } from '../route-css-cases'
import { workerPlugin } from './worker-plugin'

const timeout = 90_000

const rsbuildConfig = {
  performance: { buildCache: true },
  environments: {
    client: { tools: { rspack: { plugins: [workerPlugin] } } },
  },
}

const rootRoute = `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`

test(
  'a route that became a page is in the client route tree after the worker newly imports the tree',
  async () => {
    const cold = await buildStart({
      bundler: 'rsbuild',
      rsbuildConfig,
      files: {
        ...rsbuildEntries,
        'src/routes/__root.tsx': rootRoute,
        'src/routes/index.tsx': `import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Index })
function Index() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return (
    <main data-hydrated={String(hydrated)}>
      <Link to="/review">go to review</Link>
    </main>
  )
}
`,
        // a server route only: not in the client's route tree
        'src/routes/review.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/review')({
  server: { handlers: { GET: () => new Response('MARK_REVIEW_API') } },
})
`,
        'src/worker.ts': `self.onmessage = () => self.postMessage('ok')
`,
      },
    })
    const warm = await cold.rebuild({
      'src/routes/review.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/review')({
  component: () => <p>MARK_REVIEW_PAGE</p>,
})
`,
      'src/worker.ts': `import { routeTree } from './routeTree.gen'
self.onmessage = () => self.postMessage(Object.keys(routeTree.children ?? {}))
`,
    })
    const { url } = await warm.preview()
    const page = await openPage(url, { registerCleanup: onTestFinished })
    await page.page.locator('main[data-hydrated="true"]').waitFor()
    // a client-side navigation: the client's route tree matches the route
    await page.page.getByRole('link', { name: 'go to review' }).click()
    await page.waitForText('MARK_REVIEW_PAGE')
    expect(page.errors).toEqual([])
  },
  timeout,
)
