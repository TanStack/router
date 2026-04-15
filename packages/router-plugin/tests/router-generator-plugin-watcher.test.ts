import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'vitest'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'

import { physical, rootRoute } from '@tanstack/virtual-file-routes'
import { tanstackRouterGenerator } from '../src/vite'

const ROOT_ROUTE = `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => null })
`

const makeRouteFile = (routePath: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${routePath}')({ component: () => null })
`

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  { timeoutMs = 10_000, intervalMs = 50 } = {},
) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function routeTreeIncludes(generatedRouteTree: string, match: string) {
  try {
    const text = await readFile(generatedRouteTree, 'utf-8')
    return text.includes(match)
  } catch {
    return false
  }
}

describe('router-generator-plugin vite watcher', () => {
  let fixtureDir = ''
  let externalDir = ''
  let routesDir = ''
  let generatedRouteTree = ''
  let server: ViteDevServer | undefined

  beforeEach(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), 'tsr-plugin-watcher-'))
    routesDir = path.join(fixtureDir, 'routes')
    externalDir = path.join(fixtureDir, 'external')
    generatedRouteTree = path.join(fixtureDir, 'routeTree.gen.ts')

    await mkdir(routesDir, { recursive: true })
    await mkdir(externalDir, { recursive: true })
    await writeFile(path.join(routesDir, '__root.tsx'), ROOT_ROUTE)
    await writeFile(
      path.join(externalDir, 'alpha.tsx'),
      makeRouteFile('/ext/alpha'),
    )
  })

  afterEach(async () => {
    if (server) {
      await server.close()
      server = undefined
    }
    await rm(fixtureDir, { recursive: true, force: true })
  })

  it(
    'regenerates routeTree on add/remove in an external physical mount',
    { timeout: 20_000 },
    async () => {
      server = await createServer({
        root: fixtureDir,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, watch: {} },
        plugins: [
          tanstackRouterGenerator({
            routesDirectory: routesDir,
            generatedRouteTree,
            virtualRouteConfig: rootRoute('__root.tsx', [
              physical('/ext', externalDir),
            ]),
            disableLogging: true,
          }),
        ],
      })

      await waitUntil(() =>
        routeTreeIncludes(generatedRouteTree, "'/ext/alpha'"),
      )

      // Short settle after each fs mutation — the plugin debounces and the
      // generator may run multiple passes for a single chokidar burst.
      const settle = () => new Promise((r) => setTimeout(r, 500))

      const betaPath = path.join(externalDir, 'beta.tsx')
      await writeFile(betaPath, makeRouteFile('/ext/beta'))
      await settle()
      await waitUntil(() =>
        routeTreeIncludes(generatedRouteTree, "'/ext/beta'"),
      )

      await rm(betaPath)
      await settle()
      await waitUntil(
        async () =>
          !(await routeTreeIncludes(generatedRouteTree, "'/ext/beta'")),
      )
    },
  )
})
