/**
 * Code splitting in Vite's full-bundle dev mode (`experimental.bundledDev`,
 * SPEC §2.1 "Modes", J2.13; V2-29): Rolldown's dev engine bundles the client
 * with the router plugin's emitted modules, a real browser page runs the
 * bundle with Vite's HMR client, and the test edits the route file on disk.
 * The page renders, the split component's code loads only when the router
 * needs it, and an edit of the split component hot-updates the page.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { tanstackRouter } from '../../src/vite'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const aboutRoute = (label: string) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({
  component: About,
})
function About() {
  return <p>{'${label}'}</p>
}
`

const files = {
  'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`,
  'main.tsx': `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__router = router
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`,
  'routes/__root.tsx': `import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => (
    <div>
      <Link to="/about">about</Link>
      <Outlet />
    </div>
  ),
})
`,
  'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <p>MARK_HOME</p>,
})
`,
  'routes/about.tsx': aboutRoute('MARK_ABOUT_V1'),
}

/** File names of the scripts the page loaded so far (resource entries). */
const loadedScripts = (page: Awaited<ReturnType<typeof openPage>>) =>
  page.page.evaluate<Array<string>>(
    `performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname.slice(1))`,
  )

test('a split route renders, loads its component on demand and hot-updates in full-bundle dev', async () => {
  const server = await createDevServer({
    dir: harnessDir,
    prefix: '.dev-full-bundle-',
    registerCleanup: onTestFinished,
    browser: true,
    // The client bundle starts from the page, as \`vite dev\` bundles it.
    bundledDev: { entry: 'index.html' },
    files,
    plugins: ({ root }) => [
      tanstackRouter({
        target: 'react',
        routesDirectory: path.join(root, 'routes'),
        generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
        autoCodeSplitting: true,
      }),
      react(),
    ],
  })
  // The chunks of the client bundle the about page's code is in.
  const bundle = await server.clientBundle()
  const aboutChunks = Object.keys(bundle).filter((fileName) =>
    bundle[fileName]!.includes('MARK_ABOUT_V1'),
  )
  expect(aboutChunks.length).toBeGreaterThan(0)

  const page = await openPage(server.url!, { registerCleanup: onTestFinished })
  await page.waitForText('MARK_HOME', { selector: '#app' })
  const atHome = await loadedScripts(page)
  await page.page.locator('a').first().click()
  await page.waitForText('MARK_ABOUT_V1', { selector: '#app' })
  const afterNavigation = await loadedScripts(page)
  expect({
    // Not loaded with the home page: its own chunk, loaded on navigation.
    loadedAtHome: aboutChunks.filter((chunk) => atHome.includes(chunk)),
    loadedForAbout: aboutChunks.every((chunk) =>
      afterNavigation.includes(chunk),
    ),
  }).toEqual({ loadedAtHome: [], loadedForAbout: true })

  // An edit of the split component reaches the page as a hot update.
  await server.edit({ 'routes/about.tsx': aboutRoute('MARK_ABOUT_V2') })
  await page.waitForText('MARK_ABOUT_V2', { selector: '#app' })
  expect({ loads: page.loads(), errors: page.errors }).toEqual({
    loads: 1,
    errors: [],
  })
}, 60_000)
