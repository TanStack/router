import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'pathe'
import { parseStartConfig } from '../src/vite/schema'
import { tanStackStartRouter } from '../src/vite/start-router-plugin/plugin'
import type { TanStackStartVitePluginCoreOptions } from '../src/vite/types'

// The router plugin only reads `framework` from these.
const corePluginOpts = { framework: 'react' as const }

let root: string
let routesDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tss-api-tree-'))
  routesDir = path.join(root, 'src/routes')
  await mkdir(path.join(routesDir, 'api'), { recursive: true })
  await writeFile(
    path.join(routesDir, '__root.tsx'),
    `import { createRootRoute } from '@tanstack/react-router'\nexport const Route = createRootRoute({})\n`,
  )
  await writeFile(
    path.join(routesDir, 'api/health.ts'),
    `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/api/health')({ server: { handlers: { GET: () => new Response('ok') } } })\n`,
  )
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function fakeEnvironment() {
  const mod = { id: '\0#tanstack-start-api-route-tree' }
  return {
    moduleGraph: {
      getModuleById: vi.fn((id: string) => (id === mod.id ? mod : undefined)),
      invalidateModule: vi.fn(),
    },
    hot: { send: vi.fn() },
    runner: { evaluatedModules: { getModuleById: vi.fn() } },
  }
}

function setup() {
  const startConfig = parseStartConfig(
    { router: { tmpDir: path.join(root, '.tanstack/tmp') } },
    corePluginOpts,
    root,
  )
  const plugins = tanStackStartRouter(
    {},
    () => ({ startConfig, resolvedStartConfig: {} as any }),
    corePluginOpts as TanStackStartVitePluginCoreOptions,
  ) as Array<any>
  return {
    plugins,
    generator: plugins.find((p) => p.name === 'tanstack:router-generator'),
    apiTree: plugins.find(
      (p) => p.name === 'tanstack-start:route-tree-api-plugin',
    ),
  }
}

describe('virtual API route tree', () => {
  it('exports the server-only routes with a bare root', async () => {
    const { generator, apiTree } = setup()
    await generator.vite.configResolved({ root })
    const warn = vi.fn()

    const result = await apiTree.load.call(
      { warn },
      '\0#tanstack-start-api-route-tree',
    )

    expect(warn).not.toHaveBeenCalled()
    expect(result.code).toContain('export const apiRouteTree =')
    expect(result.code).toContain('const rootRouteImport = createRootRoute()')
    expect(result.code).toContain('api/health')
  }, 30_000)

  it('exports undefined with a warning when the root route has server options', async () => {
    await writeFile(
      path.join(routesDir, '__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'\nexport const Route = createRootRoute({ server: { middleware: [] } })\n`,
    )
    const { generator, apiTree } = setup()
    await generator.vite.configResolved({ root })
    const warn = vi.fn()

    const result = await apiTree.load.call(
      { warn },
      '\0#tanstack-start-api-route-tree',
    )

    expect(result.code).toBe('export const apiRouteTree = undefined\n')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Server-route fast path disabled'),
    )
  }, 30_000)

  it('exports undefined with a warning when a server-only param route would shadow a page', async () => {
    await writeFile(
      path.join(routesDir, 'api/$.ts'),
      `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/api/$')({ server: { handlers: { GET: () => new Response('splat') } } })\n`,
    )
    await writeFile(
      path.join(routesDir, 'api/docs.tsx'),
      `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/api/docs')({ component: () => null })\n`,
    )
    const { generator, apiTree } = setup()
    await generator.vite.configResolved({ root })
    const warn = vi.fn()

    const result = await apiTree.load.call(
      { warn },
      '\0#tanstack-start-api-route-tree',
    )

    expect(result.code).toBe('export const apiRouteTree = undefined\n')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('would shadow "/api/docs"'),
    )
  }, 30_000)
})

describe('virtual API route tree in dev', () => {
  it('invalidates the server module when a server-only route file is created', async () => {
    const startConfig = parseStartConfig(
      { router: { tmpDir: path.join(root, '.tanstack/tmp') } },
      corePluginOpts,
      root,
    )
    const plugins = tanStackStartRouter(
      {},
      () => ({ startConfig, resolvedStartConfig: {} as any }),
      corePluginOpts as TanStackStartVitePluginCoreOptions,
    ) as Array<any>
    const client = fakeEnvironment()
    const server = fakeEnvironment()
    const viteServer = { environments: { client, ssr: server } }
    for (const plugin of plugins) {
      await plugin.configureServer?.(viteServer)
    }
    const generator = plugins.find(
      (p) => p.name === 'tanstack:router-generator',
    )
    await generator.vite.configResolved({ root })

    const file = path.join(routesDir, 'api/users.ts')
    await writeFile(
      file,
      `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/api/users')({ server: { handlers: { GET: () => new Response('[]') } } })\n`,
    )
    await generator.watchChange(file, { event: 'create' })

    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '\0#tanstack-start-api-route-tree',
      }),
    )
  }, 30_000)
})
