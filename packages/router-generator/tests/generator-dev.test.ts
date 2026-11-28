/**
 * A generator kept across edits, as the bundler plugins keep one in dev and
 * watch mode: each file event (`create`, `update`, `delete`, with the
 * absolute path a file watcher reports) is passed to `run()`, and the route
 * tree must be the one a fresh generator writes for the app at that point.
 *
 * These pass the events themselves: a supplement, not watcher coverage. The
 * real dev servers' watchers, the live routes and route HMR of created and
 * renamed routes are tested in router-plugin
 * `tests/integration/{dev-server,rsbuild-dev-server}-{generator,new-routes}.test.ts`.
 */
import { existsSync } from 'node:fs'
import { chmod, rm } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect } from 'vitest'
import {
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import {
  captureThrow,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { Generator } from '../src'
import { configOf, fileRoute, read, rootRoute, save } from './app'
import { expectOnlyOwnedEdits } from './owned-edits'
import { routeIdOf } from './route-id'
import { test } from './test'
import type { Fixtures } from './test'
import type { ObservedRoute } from './route-tree'
import type { Config } from '../src'

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
 * The routes the real router builds from the route tree a fresh generator
 * writes for the app at `root` (written next to the app's route tree, so
 * its imports are the same): ids, full paths, parents, route files and
 * lazily loaded files (route-tree.ts `observeRouteTree`). A running
 * generator's tree must give the same routes; its text is free (SPEC J1.5,
 * §5.5).
 */
async function freshTree(
  observeRouteTree: Fixtures['observeRouteTree'],
  root: string,
  config: Config,
) {
  const fresh = path.join(
    path.dirname(config.generatedRouteTree),
    'fresh.gen.ts',
  )
  await new Generator({
    config: { ...config, generatedRouteTree: fresh },
    root,
  }).run()
  return observeRouteTree(fresh)
}

/** The route files of an observed tree by route id (`routesOf`, same load). */
const filesOf = (observed: Record<string, ObservedRoute>) =>
  Object.fromEntries(
    Object.entries(observed).map(([id, route]) => [id, route.file]),
  )

/** Deletes an app file (path relative to the app root); returns its path. */
async function remove(root: string, file: string) {
  const filePath = path.join(root, file)
  await rm(filePath)
  return filePath
}

describe('route edits', () => {
  test('adding a route next to nested routes gives the route tree of a fresh run', async ({
    createApp,
    observeRouteTree,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': fileRoute('/posts'),
      'src/routes/posts.$id.tsx': fileRoute('/posts/$id'),
    })
    const { config, generator } = await startGenerator(root)

    const about = await save(root, 'src/routes/about.tsx', fileRoute('/about'))
    await generator.run({ type: 'create', path: about })

    const observed = await observeRouteTree(config.generatedRouteTree)
    expect(filesOf(observed)).toEqual({
      __root__: 'routes/__root.tsx',
      '/about': 'routes/about.tsx',
      '/posts': 'routes/posts.tsx',
      '/posts/$id': 'routes/posts.$id.tsx',
    })
    expect(observed).toEqual(await freshTree(observeRouteTree, root, config))
  })

  test('deleting a nested route gives the route tree of a fresh run', async ({
    createApp,
    observeRouteTree,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': fileRoute('/posts'),
      'src/routes/posts.$id.tsx': fileRoute('/posts/$id'),
      'src/routes/posts.new.tsx': fileRoute('/posts/new'),
    })
    const { config, generator } = await startGenerator(root)

    const deleted = await remove(root, 'src/routes/posts.$id.tsx')
    await generator.run({ type: 'delete', path: deleted })

    const observed = await observeRouteTree(config.generatedRouteTree)
    expect(filesOf(observed)).toEqual({
      __root__: 'routes/__root.tsx',
      '/posts': 'routes/posts.tsx',
      '/posts/new': 'routes/posts.new.tsx',
    })
    expect(observed).toEqual(await freshTree(observeRouteTree, root, config))
  })

  test('a route deleted after an edit that changed no route leaves the route tree', async ({
    createApp,
    routesOf,
  }) => {
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

  // An update event read after the file vanished (a save through delete and
  // re-create), then an empty file at that path: it is scaffolded and in the
  // tree, as an empty route file always is.
  test('an empty route file re-created after an update read it missing is scaffolded', async ({
    createApp,
    routesOf,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/about.tsx': fileRoute('/about'),
    })
    const { config, generator } = await startGenerator(root)

    const about = await remove(root, 'src/routes/about.tsx')
    await generator.run({ type: 'update', path: about })
    await save(root, 'src/routes/about.tsx', '')
    await generator.run({ type: 'update', path: about })

    expect(await routeIdOf(await read(root, 'src/routes/about.tsx'))).toBe(
      '/about',
    )
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/about': 'routes/about.tsx',
    })
  })

  // A failed run and a warning (keeping the last good tree) are both fine,
  // if the diagnostic names the file and the place of the problem (SPEC G5,
  // §5.7).
  test('a route file broken by an edit is reported with its location, and fixing it is processed', async ({
    createApp,
    routesOf,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/posts.tsx': fileRoute('/posts'),
    })
    const { config, generator } = await startGenerator(root, {
      // (the warning is a log: `disableLogging` silences it)
      disableLogging: false,
    })

    const broken = `import { createFileRoute } from '@tanstack/react-router'

export const Route = (`
    const posts = await save(root, 'src/routes/posts.tsx', broken)
    const { result: error, diagnostics } = await captureDiagnostics(() =>
      generator.run({ type: 'update', path: posts }).then(
        () => undefined,
        (e: unknown) => e,
      ),
    )
    expectDiagnostic([...diagnosticsOf(error), ...diagnostics], {
      severity: ['error', 'warning'],
      file: posts,
      root,
      position: { line: 3 },
    })
    await save(root, 'src/routes/posts.tsx', fileRoute('/wrong'))
    await generator.run({ type: 'update', path: posts })

    const written = await read(root, 'src/routes/posts.tsx')
    expectOnlyOwnedEdits(fileRoute('/wrong'), written)
    expect(await routeIdOf(written)).toBe('/posts')
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
  test('deleting a layout route keeps its child routes in the route tree', async ({
    createApp,
    routesOf,
  }) => {
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
  })
})

// A rename or move reaches the generator as a delete and a create event, in
// either order, in one batch (a file watcher reports both before the first
// run completes).
describe.each([
  {
    name: 'a top-level route file',
    from: 'src/routes/about.tsx',
    to: 'src/routes/contact.tsx',
    routes: {
      '/contact': 'routes/contact.tsx',
      '/posts': 'routes/posts.tsx',
      '/posts/$id': 'routes/posts.$id.tsx',
    },
    id: '/contact',
  },
  {
    name: 'a child route file to another param name',
    from: 'src/routes/posts.$id.tsx',
    to: 'src/routes/posts.$postId.tsx',
    routes: {
      '/about': 'routes/about.tsx',
      '/posts': 'routes/posts.tsx',
      '/posts/$postId': 'routes/posts.$postId.tsx',
    },
    id: '/posts/$postId',
  },
  {
    name: 'a route file into a directory under its layout',
    from: 'src/routes/about.tsx',
    to: 'src/routes/posts/about.tsx',
    routes: {
      '/posts': 'routes/posts.tsx',
      '/posts/$id': 'routes/posts.$id.tsx',
      '/posts/about': 'routes/posts/about.tsx',
    },
    id: '/posts/about',
  },
])('renaming $name', ({ from, to, routes, id }) => {
  test.for(['delete', 'create'] as const)(
    'with the %s event first gives the route tree of a fresh run and fixes the route id',
    async (first, { createApp, observeRouteTree }) => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/about.tsx': fileRoute('/about'),
        'src/routes/posts.tsx': fileRoute('/posts'),
        'src/routes/posts.$id.tsx': fileRoute('/posts/$id'),
      })
      const { config, generator } = await startGenerator(root)

      const content = await read(root, from)
      const created = await save(root, to, content)
      const deleted = await remove(root, from)
      const events = [
        { type: 'delete' as const, path: deleted },
        { type: 'create' as const, path: created },
      ]
      if (first === 'create') {
        events.reverse()
      }
      await Promise.all(events.map((event) => generator.run(event)))

      const observed = await observeRouteTree(config.generatedRouteTree)
      expect(filesOf(observed)).toEqual({
        __root__: 'routes/__root.tsx',
        ...routes,
      })
      expect(await routeIdOf(await read(root, to))).toBe(id)
      expect(observed).toEqual(await freshTree(observeRouteTree, root, config))
    },
  )
})

describe('route tree file events', () => {
  test.for([
    { name: 'hand-edited', content: '// edited\n' },
    { name: 'corrupted', content: 'export const routeTree = (\n' },
  ])(
    'a $name route tree is regenerated on its update event',
    async ({ content }, { createApp, observeRouteTree }) => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/index.tsx': fileRoute('/'),
      })
      const { config, generator } = await startGenerator(root)
      const generated = await observeRouteTree(config.generatedRouteTree)

      await save(root, 'src/routeTree.gen.ts', content)
      await generator.run({ type: 'update', path: config.generatedRouteTree })

      expect(await observeRouteTree(config.generatedRouteTree)).toEqual(
        generated,
      )
    },
  )

  // Bug: a deleted route tree file is not written again: neither on its
  // delete event, nor on the next route change, whose run fails with ENOENT.
  // Source: src/generator.ts (the route tree cache still holds the deleted
  // file's content, so the write is skipped as unchanged; the next write
  // then fails in `safeFileWrite`).
  // Impact: in dev, deleting `routeTree.gen.ts` (e.g. `git clean`, a branch
  // switch) leaves the app without a route tree until the dev server
  // restarts.
  test('a deleted route tree is written again on its delete event', async ({
    createApp,
    observeRouteTree,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
    })
    const { config, generator } = await startGenerator(root)
    const generated = await observeRouteTree(config.generatedRouteTree)

    await rm(config.generatedRouteTree)
    await generator.run({ type: 'delete', path: config.generatedRouteTree })

    expect(existsSync(config.generatedRouteTree)).toBe(true)
    expect(await observeRouteTree(config.generatedRouteTree)).toEqual(generated)
  })

  test('after the route tree is deleted, adding a route writes the route tree', async ({
    createApp,
    routesOf,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
    })
    const { config, generator } = await startGenerator(root)

    await rm(config.generatedRouteTree)
    await generator.run({ type: 'delete', path: config.generatedRouteTree })
    const about = await save(root, 'src/routes/about.tsx', fileRoute('/about'))
    await generator.run({ type: 'create', path: about })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/': 'routes/index.tsx',
      '/about': 'routes/about.tsx',
    })
  })
})

describe('files no scan lists', () => {
  /**
   * An app whose `src/routes/blog/__virtual.ts` subtree appends a line to
   * `scans.log` on each evaluation: every scan evaluates it.
   */
  async function countingApp(createApp: Fixtures['createApp']) {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
      'src/routes/-components/Card.tsx': 'export const Card = () => null\n',
      'src/routes/blog/posts.tsx': fileRoute('/blog/posts'),
      'src/lib/__virtual.ts': 'export const value = 0\n',
    })
    const subtree = (
      routePath: string,
    ) => `import { appendFileSync } from 'node:fs'
import { defineVirtualSubtreeConfig, route } from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig(() => {
  appendFileSync(${JSON.stringify(path.join(root, 'scans.log'))}, 'scan\\n')
  return [route('${routePath}', 'posts.tsx')]
})
`
    await save(root, 'src/routes/blog/__virtual.ts', subtree('/posts'))
    const { config, generator } = await startGenerator(root)
    const scans = async () =>
      (await read(root, 'scans.log')).split('\n').length - 1
    return { root, config, generator, scans, subtree }
  }

  test('saving or creating a file under an ignored directory, or a __virtual.ts outside the routes, scans nothing', async ({
    createApp,
    observeRouteTree,
  }) => {
    const { root, config, generator, scans } = await countingApp(createApp)
    const tree = await read(root, 'src/routeTree.gen.ts')
    expect(await scans()).toBe(1)

    const events = [
      {
        type: 'update',
        path: await save(
          root,
          'src/routes/-components/Card.tsx',
          'export const Card = () => 1\n',
        ),
      },
      {
        type: 'create',
        path: await save(
          root,
          'src/routes/-components/List.tsx',
          'export const List = () => null\n',
        ),
      },
      {
        type: 'create',
        path: await save(
          root,
          'src/routes/-drafts/__virtual.ts',
          'export default []\n',
        ),
      },
      {
        type: 'update',
        path: await save(
          root,
          'src/lib/__virtual.ts',
          'export const value = 1\n',
        ),
      },
    ] as const
    for (const event of events) {
      await generator.run(event)
    }

    expect(await scans()).toBe(1)
    expect(await read(root, 'src/routeTree.gen.ts')).toBe(tree)
    expect(await observeRouteTree(config.generatedRouteTree)).toEqual(
      await freshTree(observeRouteTree, root, config),
    )
  })

  test('a created route, a created __virtual.ts subtree and an edited one are scanned', async ({
    createApp,
    routesOf,
  }) => {
    const { root, config, generator, scans, subtree } =
      await countingApp(createApp)

    const about = await save(root, 'src/routes/about.tsx', fileRoute('/about'))
    await generator.run({ type: 'create', path: about })
    expect(await scans()).toBe(2)

    await save(root, 'src/routes/docs/intro.tsx', fileRoute('/docs/intro'))
    const docs = await save(
      root,
      'src/routes/docs/__virtual.ts',
      `import { defineVirtualSubtreeConfig, route } from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig([route('/start', 'intro.tsx')])
`,
    )
    await generator.run({ type: 'create', path: docs })
    expect(await scans()).toBe(3)

    const blog = await save(
      root,
      'src/routes/blog/__virtual.ts',
      subtree('/articles'),
    )
    await generator.run({ type: 'update', path: blog })
    expect(await scans()).toBe(4)

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/': 'routes/index.tsx',
      '/about': 'routes/about.tsx',
      '/blog/articles': 'routes/blog/posts.tsx',
      '/docs/start': 'routes/docs/intro.tsx',
    })
  })

  test('a __virtual.ts newly naming a missing file under an ignored name gets it once created', async ({
    createApp,
    routesOf,
  }) => {
    const subtree = (file: string) =>
      `import { defineVirtualSubtreeConfig, route } from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig([route('/users', '${file}')])
`
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/admin/users.tsx': fileRoute('/admin/users'),
      'src/routes/admin/__virtual.ts': subtree('users.tsx'),
    })
    const { config, generator } = await startGenerator(root)
    const configFile = await save(
      root,
      'src/routes/admin/__virtual.ts',
      subtree('-users.tsx'),
    )
    expectDiagnostic(
      await captureThrow(() =>
        generator.run({ type: 'update', path: configFile }),
      ),
      { severity: 'error', file: 'src/routes/admin/-users.tsx', root },
    )

    const users = await save(
      root,
      'src/routes/admin/-users.tsx',
      fileRoute('/admin/users'),
    )
    await generator.run({ type: 'create', path: users })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/admin/users': 'routes/admin/-users.tsx',
    })
  })

  test.for(['cold run', 'running session'])(
    'a physical() mount of a directory under an ignored name, created after the mount, joins the routes (%s)',
    async (when, { createApp, routesOf }) => {
      const subtree = (mount: boolean) =>
        `import { defineVirtualSubtreeConfig, physical, route } from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig([route('/users', 'users.tsx')${mount ? ", physical('/shared', '-shared')" : ''}])
`
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/admin/users.tsx': fileRoute('/admin/users'),
        'src/routes/admin/__virtual.ts': subtree(when === 'cold run'),
      })
      const config = configOf(root)
      const generator = new Generator({ config, root })
      await expect(
        when === 'cold run'
          ? generator.run()
          : (async () => {
              await generator.run()
              const file = await save(
                root,
                'src/routes/admin/__virtual.ts',
                subtree(true),
              )
              await generator.run({ type: 'update', path: file })
            })(),
      ).rejects.toThrow(/ENOENT/)

      const shared = await save(
        root,
        'src/routes/admin/-shared/index.tsx',
        fileRoute('/admin/shared/'),
      )
      await generator.run({ type: 'create', path: shared })

      expect(await routesOf(config.generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/admin/shared/': 'routes/admin/-shared/index.tsx',
        '/admin/users': 'routes/admin/users.tsx',
      })
    },
  )

  test('an inline virtualRouteConfig physical() mount of a directory not created yet joins the routes once it is', async ({
    createApp,
    routesOf,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/users.tsx': fileRoute('/users'),
    })
    const config = configOf(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('/users', 'users.tsx'),
        physical('/shared', '-shared'),
      ]),
    })
    const generator = new Generator({ config, root })
    await expect(generator.run()).rejects.toThrow(/ENOENT/)

    const shared = await save(
      root,
      'src/routes/-shared/index.tsx',
      fileRoute('/shared/'),
    )
    await generator.run({ type: 'create', path: shared })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/shared/': 'routes/-shared/index.tsx',
      '/users': 'routes/users.tsx',
    })
  })

  test('a virtualRouteConfig module listing an ignored directory gets a route for a file created there', async ({
    createApp,
    routesOf,
  }) => {
    const root = await createApp({
      'routes.ts': `import { readdirSync } from 'node:fs'
import { rootRoute, route } from '@tanstack/virtual-file-routes'

const pages = readdirSync(new URL('./src/routes/-pages', import.meta.url))
export const routes = rootRoute(
  '__root.tsx',
  pages.map((file) => route('/' + file.replace(/\\.tsx$/, ''), '-pages/' + file)),
)
`,
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/-pages/a.tsx': fileRoute('/a'),
    })
    const { config, generator } = await startGenerator(root, {
      virtualRouteConfig: './routes.ts',
    })

    const page = await save(root, 'src/routes/-pages/b.tsx', fileRoute('/b'))
    await generator.run({ type: 'create', path: page })

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/a': 'routes/-pages/a.tsx',
      '/b': 'routes/-pages/b.tsx',
    })
  })

  test('a __virtual.ts listing an ignored directory gets a route for a file created there, and a save under -components/ elsewhere scans nothing', async ({
    createApp,
    routesOf,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/-components/Card.tsx': 'export const Card = () => null\n',
      'src/routes/blog/-pages/a.tsx': fileRoute('/blog/a'),
    })
    await save(
      root,
      'src/routes/blog/__virtual.ts',
      `import { appendFileSync, readdirSync } from 'node:fs'
import { defineVirtualSubtreeConfig, route } from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig(() => {
  appendFileSync(${JSON.stringify(path.join(root, 'scans.log'))}, 'scan\\n')
  return readdirSync(new URL('./-pages', import.meta.url)).map((file) =>
    route('/' + file.replace(/\\.tsx$/, ''), '-pages/' + file),
  )
})
`,
    )
    const { config, generator } = await startGenerator(root)
    const scans = async () =>
      (await read(root, 'scans.log')).split('\n').length - 1

    const page = await save(
      root,
      'src/routes/blog/-pages/b.tsx',
      fileRoute('/blog/b'),
    )
    await generator.run({ type: 'create', path: page })
    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/blog/a': 'routes/blog/-pages/a.tsx',
      '/blog/b': 'routes/blog/-pages/b.tsx',
    })
    expect(await scans()).toBe(2)

    const card = await save(
      root,
      'src/routes/-components/Card.tsx',
      'export const Card = () => 1\n',
    )
    await generator.run({ type: 'update', path: card })
    expect(await scans()).toBe(2)
  })

  test('with an inline virtualRouteConfig, a save under -components/ in its physical() mount scans nothing', async ({
    createApp,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
      'src/routes/-components/Card.tsx': 'export const Card = () => null\n',
      'src/routes/blog/posts.tsx': fileRoute('/blog/posts'),
    })
    await save(
      root,
      'src/routes/blog/__virtual.ts',
      `import { appendFileSync } from 'node:fs'
import { defineVirtualSubtreeConfig, route } from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig(() => {
  appendFileSync(${JSON.stringify(path.join(root, 'scans.log'))}, 'scan\\n')
  return [route('/posts', 'posts.tsx')]
})
`,
    )
    let changes = 0
    const { generator } = await startGenerator(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [physical('.')]),
      plugins: [{ name: 'changes', onRouteTreeChanged: () => changes++ }],
    })
    const scans = async () =>
      (await read(root, 'scans.log')).split('\n').length - 1
    const tree = await read(root, 'src/routeTree.gen.ts')
    expect([await scans(), changes]).toEqual([1, 1])

    const card = await save(
      root,
      'src/routes/-components/Card.tsx',
      'export const Card = () => 1\n',
    )
    await generator.run({ type: 'update', path: card })

    expect([await scans(), changes]).toEqual([1, 1])
    expect(await read(root, 'src/routeTree.gen.ts')).toBe(tree)
  })
})

describe('events that arrive together', () => {
  // A bundler's watcher reports the unchanged route tree (webpack rebuilds
  // once after the first build, which wrote it) while the generator's own
  // file watcher reports a created route file: both events reach `run()`
  // before either run ends.
  const createdWith = async (
    createApp: Fixtures['createApp'],
    routesOf: Fixtures['routesOf'],
    together: boolean,
  ) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
    })
    const { config, generator } = await startGenerator(root)
    const about = await save(root, 'src/routes/about.tsx', fileRoute('/about'))
    const update = { type: 'update', path: config.generatedRouteTree } as const
    const create = { type: 'create', path: about } as const
    if (together) {
      await Promise.all([generator.run(update), generator.run(create)])
    } else {
      await generator.run(update)
      await generator.run(create)
    }
    return routesOf(config.generatedRouteTree)
  }
  const withAbout = {
    __root__: 'routes/__root.tsx',
    '/': 'routes/index.tsx',
    '/about': 'routes/about.tsx',
  }

  test('a route created after an update event that changed nothing joins the route tree', async ({
    createApp,
    routesOf,
  }) => {
    expect(await createdWith(createApp, routesOf, false)).toEqual(withAbout)
  })

  // Bug: an event that arrives while a run checks events that changed
  // nothing is dropped: that run ends without looking at the events queued
  // meanwhile, so the created route is not added.
  // Source: src/generator.ts `run()` (the early `break` when every event of
  // the batch is an unchanged update skips the `while` check of the queue).
  // Impact: in webpack's watch mode, a route file created just after the
  // first build (when webpack rebuilds for the route tree the generator
  // wrote) is neither scaffolded nor routed until another route file
  // changes (router-plugin generator-watch-mode.test.ts hit it now and then).
  test('a route created while an update event that changed nothing is checked joins the route tree', async ({
    createApp,
    routesOf,
  }) => {
    expect(await createdWith(createApp, routesOf, true)).toEqual(withAbout)
  })
})

describe('first runs', () => {
  test('a routes directory without a root route fails with the root route file to add', async ({
    createApp,
  }) => {
    const root = await createApp({
      'src/routes/index.tsx': fileRoute('/'),
    })
    const error = await new Generator({ config: configOf(root), root })
      .run()
      .then(
        () => undefined,
        (e: unknown) => e as Error,
      )
    // what is missing and the file to add, in the user's terms (diagnostics
    // spike, 2026-11-24, G12)
    expect(error?.message).toBe(
      `[tanstack-router] The routes have no root route. Add the file ${path.join(root, 'src/routes/__root.tsx')}.`,
    )
  })
})

describe('route files outside the routes directory', () => {
  // Supplement of router-plugin's real-watcher scenario "a route file
  // created, edited and deleted under a physical() mount outside the routes
  // directory reaches the live routes".
  test('a route file created in a physical() directory outside the routes directory is added', async ({
    createApp,
    routesOf,
  }) => {
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

  test('a virtual route file outside the routes directory gets its id fixed when edited', async ({
    createApp,
  }) => {
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

  /**
   * A running generator of an app whose `routes.ts` virtual route config
   * routes `posts.tsx` at `/posts`, told of an edit routing it at
   * `/articles` (the file itself unchanged).
   */
  async function movePostsInConfigFile(createApp: Fixtures['createApp']) {
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
    return { root, config }
  }

  // Bug: edits to the file `virtualRouteConfig` points to are ignored by a
  // running generator: its update event is dropped (the absolute event path
  // is compared with the configured relative path), and the config module
  // is loaded from jiti's cache anyway.
  // Source: src/generator.ts:1639-1644 (isFileRelevantForRouteTreeGeneration),
  // src/filesystem/virtual/loadConfigFile.ts (jiti import of the config).
  // Impact: in dev, changing the virtual route config has no effect until
  // the dev server restarts.
  test('editing the virtualRouteConfig file updates the route tree', async ({
    createApp,
    routesOf,
  }) => {
    const { config } = await movePostsInConfigFile(createApp)

    expect(await routesOf(config.generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/articles': 'routes/posts.tsx',
    })
  })

  // Bug: a route file whose route the config moves (its content unchanged)
  // keeps its old id: the file is skipped as unchanged although the id it
  // must pass is not the one it was kept up for, while the route tree, its
  // types and the registry already use the new id.
  // Source: src/generator.ts `updateFile()` (the stamp and content early
  // returns did not compare the route the file was analysed for).
  // Impact: in dev, `FileRoutesByPath` and the file disagree after a virtual
  // route config edit until the file is touched or the server restarts.
  describe('a route file whose route the config moves without a content change gets its new id', () => {
    test('route() path in the virtualRouteConfig file', async ({
      createApp,
    }) => {
      const { root } = await movePostsInConfigFile(createApp)

      expect(await routeIdOf(await read(root, 'src/routes/posts.tsx'))).toBe(
        '/articles',
      )
    })

    test('physical() prefix in the virtualRouteConfig file', async ({
      createApp,
    }) => {
      const routes = (prefix: string) =>
        `import { rootRoute, physical } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('__root.tsx', [physical('${prefix}', 'v')])
`
      const root = await createApp({
        'routes.ts': routes('/v1'),
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/v/users.tsx': fileRoute('/v1/users'),
      })
      const { generator } = await startGenerator(root, {
        virtualRouteConfig: './routes.ts',
      })

      const configFile = await save(root, 'routes.ts', routes('/v2'))
      await generator.run({ type: 'update', path: configFile })

      expect(await routeIdOf(await read(root, 'src/routes/v/users.tsx'))).toBe(
        '/v2/users',
      )
      expect(
        [...generator.getRoutesByFileMap().values()].map((v) => v.routeId),
      ).toContain('/v2/users')
    })

    test('route() path in a __virtual.ts subtree config', async ({
      createApp,
      routesOf,
    }) => {
      const subtree = (routePath: string) =>
        `import { route } from '@tanstack/virtual-file-routes'

export default [route('${routePath}', 'x.tsx')]
`
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/sub/__virtual.ts': subtree('/a'),
        'src/routes/sub/x.tsx': fileRoute('/sub/a'),
      })
      const { config, generator } = await startGenerator(root)

      const subtreeFile = await save(
        root,
        'src/routes/sub/__virtual.ts',
        subtree('/b'),
      )
      await generator.run({ type: 'update', path: subtreeFile })

      expect(await routesOf(config.generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/sub/b': 'routes/sub/x.tsx',
      })
      expect(await routeIdOf(await read(root, 'src/routes/sub/x.tsx'))).toBe(
        '/sub/b',
      )
    })
  })
})

describe('a batch whose read of another file fails', () => {
  // A batch re-reads two route files: one lost its `Route`, the other can't
  // be read (EACCES, EISDIR: not a parse error), so the batch fails. The
  // next batch must still take the first file's change to the tree (D11:
  // the tree is a function of the files' facts), not keep importing its
  // `Route` until a file is added or removed. The unreadable file is made
  // with `chmod`, which neither Windows nor root (CI containers) honours.
  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    "a route file's change reaches the tree with the next batch",
    async ({ createApp, observeRouteTree }) => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/index.tsx': fileRoute('/'),
        'src/routes/about.tsx': fileRoute('/about'),
        'src/routes/posts.tsx': fileRoute('/posts'),
      })
      const { config, generator } = await startGenerator(root)
      const about = await save(
        root,
        'src/routes/about.tsx',
        'export const about = 1\n',
      )
      const posts = path.join(root, 'src/routes/posts.tsx')
      await chmod(posts, 0o000)
      try {
        const runs = await Promise.allSettled([
          generator.run({ type: 'update', path: about }),
          generator.run({ type: 'update', path: posts }),
        ])
        // (a batch fails on the file it cannot read: the error is that read's)
        const failures = runs.flatMap((run) =>
          run.status === 'rejected' ? [run.reason] : [],
        )
        expect(failures.length).toBeGreaterThan(0)
        for (const failure of failures) {
          expect(failure).toMatchObject({ code: 'EACCES' })
        }
      } finally {
        await chmod(posts, 0o644)
      }
      await generator.run({ type: 'update', path: posts })
      expect(await observeRouteTree(config.generatedRouteTree)).toEqual(
        await freshTree(observeRouteTree, root, config),
      )
    },
  )
})
