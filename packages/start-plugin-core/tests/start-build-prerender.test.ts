/**
 * Start's prerender step after a real build, through Start's Vite and
 * Rsbuild plugins (build-harness.ts): which pages it requests. The app's
 * server is a stand-in (`request`) that records the requested paths and
 * answers with a page; Start's own prerender step (`src/prerender.ts`) runs
 * with it.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { buildStart, routerRuntimeFiles, startBundlers } from './build-harness'

const timeout = 60_000

/** Paths Start's prerender step requested. */
const requested: Array<string> = []
const request = async (path: string) => {
  requested.push(path)
  return new Response('<html><body>page</body></html>', {
    headers: { 'content-type': 'text/html' },
  })
}

// Rsbuild's prerender step requests the pages from the server bundle's
// request handler; the stand-in answers instead.
vi.mock('../src/prerender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/prerender')>()
  return {
    ...actual,
    prerender: (options: Parameters<typeof actual.prerender>[0]) =>
      actual.prerender({
        ...options,
        handler: { ...options.handler, request, close: undefined },
      }),
  }
})
// Vite's prerender step starts a preview server of the app first.
vi.mock('../src/vite/prerender', async () => {
  const { prerender } = await import('../src/prerender')
  return {
    prerenderWithVite: ({
      startConfig,
      builder,
    }: {
      startConfig: Parameters<typeof prerender>[0]['startConfig']
      builder: import('vite').ViteBuilder
    }) =>
      prerender({
        startConfig,
        handler: {
          getClientOutputDirectory: () =>
            builder.environments.client!.config.build.outDir,
          request,
        },
      }),
  }
})

beforeEach(() => {
  requested.length = 0
  globalThis.TSS_PRERENDABLE_PATHS = undefined
})

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
/** Static pages (`/`, `/about`), a dynamic page and a server-only route. */
const files = {
  ...routerRuntimeFiles,
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/index.tsx': `${head}export const Route = createFileRoute('/')({ component: () => null })\n`,
  'src/routes/about.tsx': `${head}export const Route = createFileRoute('/about')({ component: () => null })\n`,
  'src/routes/posts.$id.tsx': `${head}export const Route = createFileRoute('/posts/$id')({ component: () => null })\n`,
  'src/routes/api.tsx': `${head}export const Route = createFileRoute('/api')({ server: { handlers: {} } })\n`,
  'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
  'src/entry.ts': `export { getRouter } from './router'\n`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  // Source: mutation round 3 start-router C (only `/` was prerendered,
  // silently, when Start did not discover the static pages).
  test(
    'prerender.enabled prerenders every static page of the route tree',
    async () => {
      await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        start: { prerender: { enabled: true, crawlLinks: false } },
      })
      expect(
        requested.map((page) => page.replace(/(.)\/$/, '$1')).sort(),
      ).toEqual(['/', '/about'])
    },
    timeout,
  )
})
