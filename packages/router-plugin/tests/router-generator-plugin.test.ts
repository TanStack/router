import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRouterGeneratorPlugin } from '../src/core/router-generator-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import type { RouterGeneratorHostOptions } from '../src/core/host-options'
import type { UnpluginOptions } from 'unplugin'

const rootRouteSource = `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()
`

const routeSource = (routePath: string) =>
  `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('${routePath}')({
  component: () => 'route',
})
`

// webpack and rspack do not report new files, so the plugin watches the
// routes directory with chokidar. The mock hands its `add` listener to the
// test.
const chokidar = vi.hoisted(() => ({
  onAdd: undefined as ((file: string) => Promise<void>) | undefined,
}))
vi.mock('chokidar', () => {
  const watch = () => {
    const watcher = {
      on(event: string, listener: (file: string) => Promise<void>) {
        if (event === 'add') {
          chokidar.onAdd = listener
        }
        return watcher
      },
      close: async () => {},
    }
    return watcher
  }
  return { watch, default: { watch } }
})

let tempDir: string | undefined

afterEach(async () => {
  chokidar.onAdd = undefined
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

/**
 * A project with the generator plugin as a plugin that embeds it sets it up,
 * driven the way Vite drives it.
 */
async function createProject(
  routes: Record<string, string>,
  hostOptions?: RouterGeneratorHostOptions,
) {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-generator-plugin-'))
  const root = tempDir
  const routesDirectory = path.join(root, 'routes')
  const generatedRouteTree = path.join(root, 'routeTree.gen.ts')
  await fs.mkdir(routesDirectory)
  for (const [file, content] of Object.entries(routes)) {
    await fs.writeFile(path.join(routesDirectory, file), content)
  }
  const plugin = createRouterGeneratorPlugin(
    {
      target: 'react',
      routesDirectory,
      generatedRouteTree,
      tmpDir: path.join(root, 'tmp'),
      disableLogging: true,
    },
    createRouterPluginContext(),
    hostOptions,
  ) as UnpluginOptions
  return {
    route: (file: string) => path.join(routesDirectory, file),
    routeTree: () => fs.readFile(generatedRouteTree, 'utf8'),
    /** Vite resolved its config. */
    async start() {
      const configResolved = plugin.vite!.configResolved as (config: {
        root: string
      }) => Promise<void>
      await configResolved.call({}, { root })
    },
    /** Vite's file watcher saw a new file. */
    async add(file: string, content: string) {
      const added = path.join(routesDirectory, file)
      await fs.writeFile(added, content)
      const watchChange = plugin.watchChange as (
        id: string,
        change: { event: 'create' | 'update' | 'delete' },
      ) => Promise<void>
      await watchChange.call({}, added, { event: 'create' })
    },
    /** A webpack or rspack watch run started. */
    async watchRun(bundler: 'rspack' | 'webpack') {
      const taps: Record<string, () => Promise<void>> = {}
      const hook = (name: string) => ({
        tap: (_plugin: string, fn: () => Promise<void>) => {
          taps[name] = fn
        },
        tapPromise: (_plugin: string, fn: () => Promise<void>) => {
          taps[name] = fn
        },
      })
      const setUp = plugin[bundler] as (compiler: unknown) => void
      setUp({
        hooks: {
          beforeRun: hook('beforeRun'),
          watchRun: hook('watchRun'),
          watchClose: hook('watchClose'),
          done: hook('done'),
        },
      })
      await taps.watchRun!()
    },
    /** chokidar saw a new file during a webpack or rspack watch run. */
    async addSeenByChokidar(file: string, content: string) {
      const added = path.join(routesDirectory, file)
      await fs.writeFile(added, content)
      await chokidar.onAdd!(added)
    },
  }
}

describe('route generator plugin', () => {
  it('writes the route tree at startup and when a route is added', async () => {
    const project = await createProject({ '__root.tsx': rootRouteSource })

    await project.start()
    expect(await project.routeTree()).not.toContain(`'/added'`)

    await project.add('added.tsx', routeSource('/added'))
    expect(await project.routeTree()).toContain(`'/added'`)
  })

  it.each(['rspack', 'webpack'] as const)(
    'writes the route tree when a route is added during a %s watch run',
    async (bundler) => {
      const project = await createProject({ '__root.tsx': rootRouteSource })

      await project.watchRun(bundler)
      expect(await project.routeTree()).not.toContain(`'/added'`)

      await project.addSeenByChokidar('added.tsx', routeSource('/added'))
      expect(await project.routeTree()).toContain(`'/added'`)
    },
  )
})

describe('route generator plugin embedded in a host plugin', () => {
  it('generates nothing when the host disables it', async () => {
    const project = await createProject(
      { '__root.tsx': rootRouteSource },
      { enabled: () => false },
    )

    await project.start()
    await project.add('added.tsx', routeSource('/added'))

    await expect(project.routeTree()).rejects.toThrow('ENOENT')
  })

  it('tells the host the config and the root it would generate for', async () => {
    const seen: Array<{ routesDirectory: string; root: string }> = []
    const project = await createProject(
      { '__root.tsx': rootRouteSource },
      {
        enabled: ({ config, root }) => {
          seen.push({ routesDirectory: config.routesDirectory, root })
          return true
        },
      },
    )

    await project.start()

    expect(seen).toEqual([
      { routesDirectory: path.dirname(project.route('x')), root: tempDir },
    ])
    expect(await project.routeTree()).toContain('rootRouteImport')
  })

  it('writes the route tree at startup only when the host turns watching off', async () => {
    const project = await createProject(
      { '__root.tsx': rootRouteSource },
      { watch: () => false },
    )

    await project.start()
    const routeTree = await project.routeTree()
    await project.add('added.tsx', routeSource('/added'))

    expect(await project.routeTree()).toBe(routeTree)
  })

  it.each(['rspack', 'webpack'] as const)(
    'ignores a route added during a %s watch run when the host turns watching off',
    async (bundler) => {
      const project = await createProject(
        { '__root.tsx': rootRouteSource },
        { watch: () => false },
      )

      await project.watchRun(bundler)
      const routeTree = await project.routeTree()
      await project.addSeenByChokidar('added.tsx', routeSource('/added'))

      expect(await project.routeTree()).toBe(routeTree)
    },
  )

  it('leaves route files as they are when the host turns writing them off', async () => {
    const moved = routeSource('/moved-from')
    const project = await createProject(
      { '__root.tsx': rootRouteSource, 'moved.tsx': moved },
      { writeRouteFiles: () => false },
    )

    await project.start()

    expect(await fs.readFile(project.route('moved.tsx'), 'utf8')).toBe(moved)
    expect(await project.routeTree()).toContain(`'/moved'`)
  })
})
