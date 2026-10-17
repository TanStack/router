/**
 * A generator kept across edits, as the bundler plugins keep one in dev and
 * watch mode: each file event (`create`, `update`, `delete`, with the
 * absolute path a file watcher reports) is passed to `run()`, and the route
 * tree must be the one a fresh generator writes for the app at that point.
 */
import { existsSync } from 'node:fs'
import { readFile, rm, stat, utimes } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { Generator } from '../src'
import { configOf, createApp, fileRoute, read, rootRoute, save } from './app'
import { routeIdOf } from './route-id'
import { routesOf } from './route-tree'
import type { Config, GeneratorPlugin, RouteNode } from '../src'

/** A generator for the app at `root`, after its first run. */
async function startGenerator(
  root: string,
  inlineConfig: Partial<Config> = {},
) {
  const config = configOf(root, inlineConfig)
  const generator = new Generator({ config, root })
  await generator.run()
  return { config, generator }
}

/**
 * The route tree a fresh generator writes for the app at `root`, written next
 * to the app's route tree (so its imports are the same).
 */
async function freshTree(root: string, config: Config) {
  const fresh = path.join(
    path.dirname(config.generatedRouteTree),
    'fresh.gen.ts',
  )
  await new Generator({
    config: { ...config, generatedRouteTree: fresh },
    root,
  }).run()
  return readFile(fresh, 'utf8')
}

/** Deletes an app file (path relative to the app root); returns its path. */
async function remove(root: string, file: string) {
  const filePath = path.join(root, file)
  await rm(filePath)
  return filePath
}

describe('route edits', () => {
  test('adding a route next to nested routes gives the route tree of a fresh run', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': fileRoute('/posts'),
      'src/routes/posts.$id.tsx': fileRoute('/posts/$id'),
    })
    const { config, generator } = await startGenerator(root)

    const about = await save(root, 'src/routes/about.tsx', fileRoute('/about'))
    await generator.run({ type: 'create', path: about })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/about': 'routes/about.tsx',
      '/posts': 'routes/posts.tsx',
      '/posts/$id': 'routes/posts.$id.tsx',
    })
    expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(
      await freshTree(root, config),
    )
  })

  test('deleting a nested route gives the route tree of a fresh run', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': fileRoute('/posts'),
      'src/routes/posts.$id.tsx': fileRoute('/posts/$id'),
      'src/routes/posts.new.tsx': fileRoute('/posts/new'),
    })
    const { config, generator } = await startGenerator(root)

    const deleted = await remove(root, 'src/routes/posts.$id.tsx')
    await generator.run({ type: 'delete', path: deleted })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/posts': 'routes/posts.tsx',
      '/posts/new': 'routes/posts.new.tsx',
    })
    expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(
      await freshTree(root, config),
    )
  })

  test('a route deleted after an edit that changed no route leaves the route tree', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/', "{ component: () => 'index' }"),
      'src/routes/bar.tsx': fileRoute('/bar'),
    })
    const { config, generator } = await startGenerator(root)

    const index = await save(
      root,
      'src/routes/index.tsx',
      fileRoute('/', "{ component: () => 'edited' }"),
    )
    await generator.run({ type: 'update', path: index })
    const deleted = await remove(root, 'src/routes/bar.tsx')
    await generator.run({ type: 'delete', path: deleted })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/': 'routes/index.tsx',
    })
  })

  test('a route file broken by an edit fails the run, and fixing it is processed', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': fileRoute('/posts'),
    })
    const { config, generator } = await startGenerator(root)

    const posts = await save(
      root,
      'src/routes/posts.tsx',
      'export const Route = (',
    )
    await expect(
      generator.run({ type: 'update', path: posts }),
    ).rejects.toThrow('posts.tsx')
    await save(root, 'src/routes/posts.tsx', fileRoute('/wrong'))
    await generator.run({ type: 'update', path: posts })

    expect(await read(root, 'src/routes/posts.tsx')).toBe(fileRoute('/posts'))
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/posts': 'routes/posts.tsx',
    })
  })

  // Control: "deleting a nested route gives the route tree of a fresh run"
  // above (same harness, deleting a leaf route).

  // Bug: after a layout route file is deleted, its child routes disappear
  // from the route tree of a running generator, while a fresh run keeps them
  // (under the root route).
  // Source: src/generator.ts (route nodes reused from the cache keep the
  // `parent` of the run that created them, so the child still points at the
  // deleted layout).
  // Impact: in dev, deleting `posts.tsx` while keeping `posts.$id.tsx`
  // removes `/posts/$id` from the app until the dev server restarts.
  test.fails(
    'deleting a layout route keeps its child routes in the route tree',
    async () => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/posts.tsx': fileRoute('/posts'),
        'src/routes/posts.$id.tsx': fileRoute('/posts/$id'),
      })
      const { config, generator } = await startGenerator(root)

      const deleted = await remove(root, 'src/routes/posts.tsx')
      await generator.run({ type: 'delete', path: deleted })

      expect(await routesOf(config.generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/posts/$id': 'routes/posts.$id.tsx',
      })
    },
  )
})

describe('route tree file events', () => {
  test.each([
    { name: 'hand-edited', content: '// edited\n' },
    { name: 'corrupted', content: 'export const routeTree = (\n' },
  ])(
    'a $name route tree is regenerated on its update event',
    async ({ content }) => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/index.tsx': fileRoute('/'),
      })
      const { config, generator } = await startGenerator(root)
      const generated = await readFile(config.generatedRouteTree, 'utf8')

      await save(root, 'src/routeTree.gen.ts', content)
      await generator.run({ type: 'update', path: config.generatedRouteTree })

      expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(generated)
    },
  )

  // Control: "a hand-edited route tree is regenerated on its update event"
  // above (same harness).

  // Bug: a deleted route tree file is not written again: neither on its
  // delete event, nor on the next route change, whose run fails with ENOENT.
  // Source: src/generator.ts (the route tree cache still holds the deleted
  // file's content, so the write is skipped as unchanged; the next write
  // then fails in `safeFileWrite`).
  // Impact: in dev, deleting `routeTree.gen.ts` (e.g. `git clean`, a branch
  // switch) leaves the app without a route tree until the dev server
  // restarts.
  test.fails(
    'a deleted route tree is written again on its delete event',
    async () => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/index.tsx': fileRoute('/'),
      })
      const { config, generator } = await startGenerator(root)
      const generated = await readFile(config.generatedRouteTree, 'utf8')

      await rm(config.generatedRouteTree)
      await generator.run({ type: 'delete', path: config.generatedRouteTree })

      expect(existsSync(config.generatedRouteTree)).toBe(true)
      expect(await readFile(config.generatedRouteTree, 'utf8')).toBe(generated)
    },
  )

  test.fails(
    'after the route tree is deleted, adding a route writes the route tree',
    async () => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/index.tsx': fileRoute('/'),
      })
      const { config, generator } = await startGenerator(root)

      await rm(config.generatedRouteTree)
      await generator.run({ type: 'delete', path: config.generatedRouteTree })
      const about = await save(
        root,
        'src/routes/about.tsx',
        fileRoute('/about'),
      )
      await generator.run({ type: 'create', path: about })

      expect(await routesOf(config.generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/': 'routes/index.tsx',
        '/about': 'routes/about.tsx',
      })
    },
  )
})

describe('first runs', () => {
  test('a new generator on an up-to-date app does not rewrite the route tree', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
    })
    const { config } = await startGenerator(root)
    const past = new Date('2020-01-01T00:00:00Z')
    await utimes(config.generatedRouteTree, past, past)

    await new Generator({ config, root }).run()

    expect((await stat(config.generatedRouteTree)).mtimeMs).toBe(past.getTime())
  })

  test('a routes directory without a root route fails with the root route file to add', async () => {
    const root = await createApp({
      'src/routes/index.tsx': fileRoute('/'),
    })
    await expect(
      new Generator({ config: configOf(root), root }).run(),
    ).rejects.toThrow('__root.tsx')
  })
})

describe('route files outside the routes directory', () => {
  test('a route file created in a physical() directory outside the routes directory is added', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/features/a/index.tsx': fileRoute('/a/'),
      'src/other/b/index.tsx': fileRoute('/b/'),
    })
    const { config, generator } = await startGenerator(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        physical('/a', '../features/a'),
        physical('/b', '../other/b'),
      ]),
    })

    const created = await save(
      root,
      'src/features/a/new.tsx',
      fileRoute('/wrong'),
    )
    await generator.run({ type: 'create', path: created })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/a/': 'features/a/index.tsx',
      '/a/new': 'features/a/new.tsx',
      '/b/': 'other/b/index.tsx',
    })
    expect(await routeIdOf(await read(root, 'src/features/a/new.tsx'))).toBe(
      '/a/new',
    )
  })

  test('a virtual route file outside the routes directory gets its id fixed when edited', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/features/posts.tsx': fileRoute('/posts'),
    })
    const { generator } = await startGenerator(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('/posts', '../features/posts.tsx'),
      ]),
    })

    const posts = await save(
      root,
      'src/features/posts.tsx',
      fileRoute('/wrong'),
    )
    await generator.run({ type: 'update', path: posts })

    expect(await routeIdOf(await read(root, 'src/features/posts.tsx'))).toBe(
      '/posts',
    )
  })

  // Control: the two tests above (same harness, editing route files).

  // Bug: edits to the file `virtualRouteConfig` points to are ignored by a
  // running generator: its update event is dropped (the absolute event path
  // is compared with the configured relative path), and the config module
  // is loaded from jiti's cache anyway.
  // Source: src/generator.ts:1639-1644 (isFileRelevantForRouteTreeGeneration),
  // src/filesystem/virtual/getRouteNodes.ts (config file loading).
  // Impact: in dev, changing the virtual route config has no effect until
  // the dev server restarts.
  test.fails(
    'editing the virtualRouteConfig file updates the route tree',
    async () => {
      const routes = (routePath: string) =>
        `import { rootRoute, route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('__root.tsx', [route('${routePath}', 'posts.tsx')])
`
      const root = await createApp({
        'routes.ts': routes('/posts'),
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/posts.tsx': fileRoute('/posts'),
      })
      const { config, generator } = await startGenerator(root, {
        virtualRouteConfig: './routes.ts',
      })

      const configFile = await save(root, 'routes.ts', routes('/articles'))
      await generator.run({ type: 'update', path: configFile })

      expect(await routesOf(config.generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/articles': 'routes/posts.tsx',
      })
    },
  )
})

describe('generator plugins', () => {
  test('afterTransform receives the previous route node of a changed route file', async () => {
    // Like Start's server-only route detection: a route is server-only when
    // its only option is `server`.
    const isServerOnly = (node: RouteNode | undefined) =>
      node?.createFileRouteProps?.size === 1 &&
      node.createFileRouteProps.has('server')
    let toggled: Array<string | undefined> = []
    const plugin: GeneratorPlugin = {
      name: 'server-only-toggles',
      afterTransform({ node, prevNode }) {
        if (isServerOnly(node) !== isServerOnly(prevNode)) {
          toggled.push(node.routePath)
        }
      },
    }
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/api.tsx': fileRoute('/api', '{ server: {} }'),
      'src/routes/posts.tsx': fileRoute('/posts', '{ server: {} }'),
    })
    const { generator } = await startGenerator(root, { plugins: [plugin] })
    expect(toggled.sort()).toEqual(['/api', '/posts'])

    toggled = []
    const posts = await save(
      root,
      'src/routes/posts.tsx',
      fileRoute('/posts', '{ component: () => null }'),
    )
    await generator.run({ type: 'update', path: posts })
    expect(toggled).toEqual(['/posts'])

    toggled = []
    await save(
      root,
      'src/routes/posts.tsx',
      fileRoute('/posts', "{ component: () => 'edited' }"),
    )
    await generator.run({ type: 'update', path: posts })
    expect(toggled).toEqual([])
  })

  test('getRoutesByFileMap maps each route file, the root route file included, to its route id', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': fileRoute('/posts'),
    })
    const { generator } = await startGenerator(root)
    const routesByFile = () =>
      Object.fromEntries(
        [...generator.getRoutesByFileMap()].map(([file, { routeId }]) => [
          path.relative(root, file).replaceAll(path.sep, '/'),
          routeId,
        ]),
      )

    expect(routesByFile()).toEqual({
      'src/routes/__root.tsx': '/__root',
      'src/routes/posts.tsx': '/posts',
    })
    await generator.run({ type: 'rerun' })
    expect(routesByFile()).toEqual({
      'src/routes/__root.tsx': '/__root',
      'src/routes/posts.tsx': '/posts',
    })
  })
})
