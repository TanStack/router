/**
 * A route lazily importing a client-only component (`*.client.*`, denied in
 * the server environment by default, SPEC J6.1) on Vite and Rsbuild dev
 * servers of a Start app, with `behavior: 'error'` and `'mock'`, the pages
 * requested over HTTP as a browser requests them:
 * - `/explore` is tanstack.com's route: `ssr: false`, the component renders
 *   `lazy(() => import('~/components/game/IslandExplorer.client'))` inside
 *   `<ClientOnly>` and `<Suspense>`. The server never renders the component,
 *   so the dynamic import is not in any server module: nothing is reported
 *   and the page is served (main: the same);
 * - `/lazy-client` renders `lazy(() => import('../components/Widget.client'))`
 *   with SSR: the server's component module imports the denied file, which
 *   is reported (main: the same);
 * - `/` imports neither. Every page but the violating one is served whatever
 *   `behavior` is: a violation fails the module holding the import, never
 *   the route tree (main: `resolveId` of that import fails).
 */
import { afterAll, describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { startServerEntryFiles } from '../../dev-server'
import {
  distinct,
  locationParts,
  rejection,
  violationRecorder,
  violationsOf,
} from '../../importProtection/start-apps'
import {
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import type { ImportProtectionOptions } from '../../importProtection/public-types'
import type { Recorded } from '../../importProtection/start-apps'

const timeout = 60_000

const app = {
  ...startServerEntryFiles,
  'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      paths: { '~/*': ['./src/*'] },
    },
    include: ['src'],
  }),
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
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
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>MARK_INDEX</p> })
`,
  // tanstack.com's src/routes/explore.tsx
  'src/routes/explore.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

// Lazy load the entire game to keep it out of main bundle
const IslandExplorer = lazy(
  () => import('~/components/game/IslandExplorer.client'),
)

export const Route = createFileRoute('/explore')({
  ssr: false,
  component: ExplorePage,
  head: () => ({ meta: [{ title: 'MARK_EXPLORE_TITLE' }] }),
})

function LoadingScreen() {
  return <p>Preparing your voyage...</p>
}

function ExplorePage() {
  return (
    <ClientOnly>
      <Suspense fallback={<LoadingScreen />}>
        <IslandExplorer />
      </Suspense>
    </ClientOnly>
  )
}
`,
  'src/components/game/IslandExplorer.client.tsx': `export default function IslandExplorer() {
  return <p>island {window.location.pathname}</p>
}
`,
  'src/routes/lazy-client.tsx': `import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const Widget = lazy(() => import('../components/Widget.client'))

export const Route = createFileRoute('/lazy-client')({ component: Page })

function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Widget />
    </Suspense>
  )
}
`,
  'src/components/Widget.client.tsx': `export default function Widget() {
  return <p>widget {window.location.pathname}</p>
}
`,
}

/** `environment importer specifier` of each distinct reported violation. */
const reportsOf = (recorded: Recorded) =>
  distinct(
    violationsOf(recorded).map(
      ({ environment, importer, specifier }) =>
        `${environment} ${locationParts(importer).file} ${specifier}`,
    ),
  )

const lazyReport =
  'server src/routes/lazy-client.tsx ../components/Widget.client'

/** The status and body of `pathname` (fresh requests, in order). */
async function request(url: string, pathname: string) {
  const response = await fetch(new URL(pathname, url))
  return { status: response.status, body: await response.text() }
}

const cleanups: Array<() => Promise<void>> = []
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup()
  }
})
const registerCleanup = (cleanup: () => Promise<void>) => {
  cleanups.push(cleanup)
}

const hosts = {
  vite: async (importProtection: ImportProtectionOptions) => {
    const server = await startDevServer({
      start: { importProtection },
      files: app,
      config: { resolve: { tsconfigPaths: true } },
      registerCleanup,
    })
    return { url: server.url!, root: server.root }
  },
  rsbuild: async (importProtection: ImportProtectionOptions) => {
    const server = await startRsbuildStartDevServer({
      // Start serves the pages, not an HTML template.
      config: { tools: { htmlPlugin: false } },
      start: { importProtection },
      files: {
        ...app,
        'harness/server-entry.ts':
          startServerEntryFiles['harness/server-entry.ts'],
      },
      registerCleanup,
    })
    return { url: server.url!, root: server.root }
  },
}

describe.each(['vite', 'rsbuild'] as const)('%s dev', (host) => {
  describe.each(['error', 'mock'] as const)('behavior: %s', (behavior) => {
    test(
      'only the server-rendered lazy .client import is reported, and every page is served',
      async () => {
        const recorder = violationRecorder({ behavior })
        const { url, root } = await hosts[host](recorder.importProtection)

        const index = await request(url, '/')
        const explore = await request(url, '/explore')
        // the violating page answers too (its server render failed or read
        // a mock: the client renders it)
        const lazyClient = await request(url, '/lazy-client')
        const indexAgain = await request(url, '/')

        expect(index.status).toBe(200)
        expect(index.body).toContain('MARK_INDEX')
        expect(explore.status).toBe(200)
        expect(explore.body).toContain('MARK_EXPLORE_TITLE')
        expect(lazyClient.status).toBe(200)
        expect(indexAgain.status).toBe(200)
        expect(indexAgain.body).toContain('MARK_INDEX')
        expect(reportsOf({ root, violations: recorder.violations })).toEqual([
          lazyReport,
        ])
      },
      timeout,
    )
  })
})

// A build (default `behavior`: error) reports the same import only: the
// server bundle keeps `/lazy-client`'s, not `/explore`'s.
describe.each(['vite', 'rsbuild'] as const)('%s build', (bundler) => {
  test(
    'the build fails on the server-rendered lazy .client import only',
    async () => {
      const {
        'harness/client-entry.ts': _client,
        'harness/server-entry.ts': _server,
        ...files
      } = app
      const error = await rejection(
        buildStart({
          bundler,
          files: { ...files, 'src/entry.ts': `export {}\n` },
          entry: 'src/entry.ts',
          ...(bundler === 'vite' && {
            viteConfig: { resolve: { tsconfigPaths: true } },
          }),
        }),
      )
      expect(reportsOf(error)).toEqual([lazyReport])
    },
    timeout,
  )
})
