import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import chokidar from 'chokidar'
import { afterEach, beforeEach, describe, it } from 'vitest'

import { physical, rootRoute } from '@tanstack/virtual-file-routes'
import { unpluginRouterGeneratorFactory } from '../src/core/router-generator-plugin'

const ROOT_ROUTE = `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => null })
`

const makeRouteFile = (routePath: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${routePath}')({ component: () => null })
`

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  { timeoutMs = 2000, intervalMs = 25 } = {},
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
  let watcher: chokidar.FSWatcher | undefined

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
    if (watcher) {
      await watcher.close()
      watcher = undefined
    }
    await rm(fixtureDir, { recursive: true, force: true })
  })

  it('regenerates routeTree when a file is added to an external physical mount', async () => {
    const plugin = unpluginRouterGeneratorFactory({
      routesDirectory: routesDir,
      generatedRouteTree,
      virtualRouteConfig: rootRoute('__root.tsx', [
        physical('/ext', externalDir),
      ]),
      disableLogging: true,
    })

    const viteHooks = plugin.vite as {
      configResolved: (config: { root: string }) => Promise<void>
      configureServer: (server: {
        watcher: chokidar.FSWatcher
      }) => void | Promise<void>
    }

    await viteHooks.configResolved({ root: fixtureDir })
    await waitUntil(() => routeTreeIncludes(generatedRouteTree, "'/ext/alpha'"))

    watcher = chokidar.watch(routesDir, { ignoreInitial: true })
    await new Promise((resolve) => watcher!.once('ready', resolve))
    await viteHooks.configureServer({ watcher })

    // Add a new route file in the external mount.
    const betaPath = path.join(externalDir, 'beta.tsx')
    await writeFile(betaPath, makeRouteFile('/ext/beta'))

    await waitUntil(() => routeTreeIncludes(generatedRouteTree, "'/ext/beta'"))

    // Removing the file should likewise trigger regeneration.
    await rm(betaPath)
    await waitUntil(
      async () => !(await routeTreeIncludes(generatedRouteTree, "'/ext/beta'")),
    )
  })
})
