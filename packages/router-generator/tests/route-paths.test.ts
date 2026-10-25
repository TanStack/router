/**
 * The URLs routes get from their file names and virtual route configs:
 * escaped underscores (`[_]`), literal underscores in virtual paths, route
 * groups, pathless layouts, and token and param validation, read from the
 * evaluated route tree.
 */
import { describe, expect, test } from 'vitest'
import {
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  index,
  layout,
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { createApp, fileRoute, generate, lazyFileRoute, rootRoute } from './app'
import { checkApp, page } from './real-router'
import { matchesOf, routesOf, urlsOf } from './route-tree'
import type { Config } from '../src'

/** An app with a root route and a route file for each of `files`. */
async function appWithRoutes(files: Array<string>) {
  const routeFiles: Record<string, string> = {
    'src/routes/__root.tsx': rootRoute(),
  }
  for (const file of files) {
    routeFiles[`src/routes/${file}`] = fileRoute('/wrong')
  }
  return createApp(routeFiles)
}

describe('underscores', () => {
  test('an escaped leading underscore after the first segment of a flat route file name stays in the URL', async () => {
    const root = await appWithRoutes([
      'foo.[_]bar.tsx',
      'posts.tsx',
      'posts.a.[_]b.tsx',
    ])
    const { generatedRouteTree } = await generate(root)

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/foo/_bar': '/foo/_bar',
      '/posts': '/posts',
      '/posts/a/_b': '/posts/a/_b',
    })
  })

  test('a virtual route path with an underscore after its first segment keeps it in the URL', async () => {
    const root = await appWithRoutes([
      'foobar.tsx',
      'deep.tsx',
      'sub/index.tsx',
    ])
    const { generatedRouteTree } = await generate(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('/foo/_bar', 'foobar.tsx'),
        virtualRoute('/x/y/_z', 'deep.tsx'),
        physical('/api/_v1', 'sub'),
      ]),
    })

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/foo/_bar': '/foo/_bar',
      '/x/y/_z': '/x/y/_z',
      '/api/_v1/': '/api/_v1/',
    })
  })

  test('escaped underscores in a physical directory mounted under a virtual route with a literal underscore stay in the URLs', async () => {
    const root = await appWithRoutes([
      'foo.tsx',
      'phys/[_]hello.tsx',
      'phys/blog[_].tsx',
      'phys/[_]q/w.tsx',
      'phys/index.tsx',
    ])
    const { generatedRouteTree } = await generate(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('/_foo', 'foo.tsx', [physical('/_p', 'phys')]),
      ]),
    })

    const urls = await urlsOf(generatedRouteTree)
    const routes = await routesOf(generatedRouteTree)
    expect(
      Object.fromEntries(
        Object.entries(routes).map(([id, file]) => [file, urls[id]]),
      ),
    ).toEqual({
      'routes/__root.tsx': '/',
      'routes/foo.tsx': '/_foo',
      'routes/phys/[_]hello.tsx': '/_foo/_p/_hello',
      'routes/phys/blog[_].tsx': '/_foo/_p/blog_',
      'routes/phys/[_]q/w.tsx': '/_foo/_p/_q/w',
      'routes/phys/index.tsx': '/_foo/_p/',
    })
  })

  test('virtual layouts and an index under a virtual route with a literal underscore', async () => {
    const root = await appWithRoutes([
      'foo.tsx',
      'lay.tsx',
      'inner.tsx',
      'fooindex.tsx',
    ])
    const { generatedRouteTree } = await generate(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('/_foo', 'foo.tsx', [
          layout('lay', 'lay.tsx', [virtualRoute('/inner', 'inner.tsx')]),
          index('fooindex.tsx'),
        ]),
      ]),
    })

    const urls = await urlsOf(generatedRouteTree)
    const routes = await routesOf(generatedRouteTree)
    expect(
      Object.fromEntries(
        Object.entries(routes).map(([id, file]) => [file, urls[id]]),
      ),
    ).toEqual({
      'routes/__root.tsx': '/',
      'routes/foo.tsx': '/_foo',
      'routes/lay.tsx': '/_foo',
      'routes/inner.tsx': '/_foo/inner',
      'routes/fooindex.tsx': '/_foo/',
    })
  })

  test('a pathless layout under a route with an escaped leading underscore adds no path segment', async () => {
    const root = await appWithRoutes([
      '[_]api.tsx',
      '[_]api/_auth.tsx',
      '[_]api/_auth/users.tsx',
    ])
    const { generatedRouteTree } = await generate(root)

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/_api': '/_api',
      '/_api/_auth': '/_api',
      '/_api/_auth/users': '/_api/users',
    })
  })

  // Escapes and un-nesting in directory route files under pathless
  // layouts (file-naming-conventions.md: `_` prefix pathless, `_` suffix
  // un-nesting, `[x]` escapes); ported from the helper tests of utils.ts.
  test('escaped and trailing underscores under pathless layouts keep or drop their underscores as escaped', async () => {
    const root = await appWithRoutes([
      '_layout.tsx',
      '_layout/[_][_]foo.tsx',
      '_layout/bar_/index.tsx',
      '_layout/[_]baz[_]/index.tsx',
      '[_]a/bar[_]/[_baz_]/index.tsx',
      '[_]auth/_admin.tsx',
      '[_]auth/_admin/dashboard.tsx',
    ])
    const { generatedRouteTree } = await generate(root)

    const urls = await urlsOf(generatedRouteTree)
    const routes = await routesOf(generatedRouteTree)
    expect(
      Object.fromEntries(
        Object.entries(routes).map(([id, file]) => [file, urls[id]]),
      ),
    ).toEqual({
      'routes/__root.tsx': '/',
      'routes/_layout.tsx': '/',
      'routes/_layout/[_][_]foo.tsx': '/__foo',
      'routes/_layout/bar_/index.tsx': '/bar/',
      'routes/_layout/[_]baz[_]/index.tsx': '/_baz_/',
      'routes/[_]a/bar[_]/[_baz_]/index.tsx': '/_a/bar_/_baz_/',
      'routes/[_]auth/_admin.tsx': '/_auth',
      'routes/[_]auth/_admin/dashboard.tsx': '/_auth/dashboard',
    })
  })
})

describe('virtual route paths', () => {
  test('virtual route paths and physical mount prefixes without a leading slash get the same URLs', async () => {
    const root = await appWithRoutes(['x.tsx', 'dir/index.tsx'])
    const { generatedRouteTree } = await generate(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('docs/intro', 'x.tsx'),
        physical('api/v1', 'dir'),
      ]),
    })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/docs/intro': 'routes/x.tsx',
      '/api/v1/': 'routes/dir/index.tsx',
    })
    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/docs/intro': '/docs/intro',
      '/api/v1/': '/api/v1/',
    })
  })

  // In a virtual route path a dot is a literal character, and a bracket
  // escape stands for its content (no file-route separators apply).
  test('dots and bracket escapes in virtual route paths are literal characters of the URL', async () => {
    const root = await appWithRoutes(['a.tsx', 'b.tsx'])
    const { generatedRouteTree } = await generate(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('/files.json', 'a.tsx'),
        virtualRoute('/pathless[.]layout', 'b.tsx'),
      ]),
    })

    const urls = await urlsOf(generatedRouteTree)
    const routes = await routesOf(generatedRouteTree)
    expect(
      Object.fromEntries(
        Object.entries(routes).map(([id, file]) => [file, urls[id]]),
      ),
    ).toEqual({
      'routes/__root.tsx': '/',
      'routes/a.tsx': '/files.json',
      'routes/b.tsx': '/pathless.layout',
    })
  })

  // A virtual route config built with `path.join` on Windows has backslash
  // separators in its file paths.
  test('virtual route files given with Windows path separators are imported', async () => {
    const root = await appWithRoutes(['docs/intro.tsx', 'docs/index.tsx'])
    const { generatedRouteTree } = await generate(root, {
      virtualRouteConfig: virtualRootRoute('__root.tsx', [
        virtualRoute('/intro', 'docs\\intro.tsx'),
        index('docs\\index.tsx'),
      ]),
    })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/intro': 'routes/docs/intro.tsx',
      '/': 'routes/docs/index.tsx',
    })
  })
})

describe('layouts and groups', () => {
  test('a route group layout adds no path segment', async () => {
    const root = await appWithRoutes([
      '(auth)/route.tsx',
      '(auth)/login.tsx',
      'shop.tsx',
      'shop/(account)/route.tsx',
      'shop/(account)/orders.tsx',
    ])
    const { generatedRouteTree } = await generate(root)

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/(auth)': '/',
      '/(auth)/login': '/login',
      '/shop': '/shop',
      '/shop/(account)': '/shop',
      '/shop/(account)/orders': '/shop/orders',
    })
  })

  // Control for the pins below (same harness, no index route).
  test('a pathless layout without child routes yet is added to the route tree', async () => {
    const root = await appWithRoutes(['about.tsx', '_auth.tsx'])
    const { generatedRouteTree } = await generate(root)

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/about': 'routes/about.tsx',
      '/_auth': 'routes/_auth.tsx',
    })
  })

  // Bug: a pathless layout file without children yet (`_auth.tsx` or
  // `_auth.lazy.tsx`) next to the index route fails the generator with
  // "Conflicting configuration paths were found" for `/` (the layout's full
  // path is `/`, like the index route's), although the layout matches no URL
  // of its own. A childless pathless layout is a valid, if useless, route
  // (SPEC J1.15; routing/file-naming-conventions.md:35).
  // Source: src/utils.ts:1101-1125 (`checkRouteFullPathUniqueness` compares
  // the inferred full paths of all routes, pathless layouts included).
  // Impact: creating `_auth.tsx` before its first child route stops route
  // generation for the whole app.
  test.each([
    { name: '_auth.tsx', file: '_auth.tsx', constructor: 'createFileRoute' },
    {
      name: '_auth.lazy.tsx',
      file: '_auth.lazy.tsx',
      constructor: 'createLazyFileRoute',
    },
  ])(
    'a pathless layout without child routes yet ($name) next to the index route is added to the route tree',
    ({ file, constructor }) =>
      checkApp({
        name: `a childless ${file} next to the index route`,
        files: {
          'src/routes/__root.tsx': page(
            'react',
            'createRootRoute',
            'root',
            true,
          ),
          'src/routes/index.tsx': page('react', 'createFileRoute', 'home'),
          [`src/routes/${file}`]: page('react', constructor, 'auth', true),
        },
        expected: {
          __root__: ['/', null],
          '/': ['/', '__root__'],
          '/_auth': ['/', '__root__'],
        },
        visits: { '/': '/' },
        pages: { '/': ['root', 'home'] },
      }),
    60_000,
  )

  // A pathless layout under a route that exists only as a lazy route file
  // (`posts.lazy.tsx`, no `posts.tsx`) nests under the lazy-only route's
  // virtual anchor (guide/code-splitting.md:222-224; SPEC J1.14). Control for
  // the pin below.
  test(
    'a pathless layout under a route with only a lazy route file nests under that route',
    () =>
      checkApp(
        {
          name: 'a pathless layout under a lazy-only route',
          files: {
            'src/routes/__root.tsx': page(
              'react',
              'createRootRoute',
              'root',
              true,
            ),
            'src/routes/posts.lazy.tsx': page(
              'react',
              'createLazyFileRoute',
              'posts',
              true,
            ),
            'src/routes/posts/_layout.tsx': page(
              'react',
              'createFileRoute',
              'layout',
              true,
            ),
            'src/routes/posts/_layout/child.tsx': page(
              'react',
              'createFileRoute',
              'child',
            ),
          },
          expected: {
            __root__: ['/', null],
            '/posts': ['/posts', '__root__'],
            '/posts/_layout': ['/posts', '/posts'],
            '/posts/_layout/child': ['/posts/child', '/posts/_layout'],
          },
          visits: { '/posts/child': '/posts/_layout/child' },
          pages: { '/posts/child': ['root', 'posts', 'layout', 'child'] },
        },
        // (the types of the same shapes: the pin below)
        { types: false },
      ),
    60_000,
  )

  // Bug (SPEC J1.14): a pathless layout one directory below a lazy-only route
  // (`app/posts.lazy.tsx`, no `app/posts.tsx`, and
  // `app/posts/drafts/_layout.tsx` with children) is attached to the next
  // real ancestor (`/app`) instead of to the lazy-only route's virtual anchor
  // `/app/posts`, so `/app/posts/drafts/child` renders without the
  // `/app/posts` page around it (same rule as the control above:
  // guide/code-splitting.md:222-224; SPEC J1.14). Distinct from the pin of a
  // lazy-only pathless layout losing its directory path.
  // Source: src/generator.ts:1561-1606 (`isPathlessLayoutWithPath`: the
  // search for the layout's parent skips virtual routes, which include the
  // anchors of lazy-only routes).
  // Impact: the lazy-only route's component (its layout) and its loaders do
  // not wrap the pages under such a layout.
  test(
    'a pathless layout in a directory under a route with only a lazy route file nests under that route',
    () =>
      checkApp({
        name: 'a pathless layout in a directory under a lazy-only route',
        files: {
          'src/routes/__root.tsx': page(
            'react',
            'createRootRoute',
            'root',
            true,
          ),
          'src/routes/app.tsx': page('react', 'createFileRoute', 'app', true),
          'src/routes/app/posts.lazy.tsx': page(
            'react',
            'createLazyFileRoute',
            'posts',
            true,
          ),
          'src/routes/app/posts/drafts/_layout.tsx': page(
            'react',
            'createFileRoute',
            'layout',
            true,
          ),
          'src/routes/app/posts/drafts/_layout/child.tsx': page(
            'react',
            'createFileRoute',
            'child',
          ),
        },
        expected: {
          __root__: ['/', null],
          '/app': ['/app', '__root__'],
          '/app/posts': ['/app/posts', '/app'],
          '/app/posts/drafts/_layout': ['/app/posts/drafts', '/app/posts'],
          '/app/posts/drafts/_layout/child': [
            '/app/posts/drafts/child',
            '/app/posts/drafts/_layout',
          ],
        },
        visits: {
          '/app/posts/drafts/child': '/app/posts/drafts/_layout/child',
        },
        pages: {
          '/app/posts/drafts/child': [
            'root',
            'app',
            'posts',
            'layout',
            'child',
          ],
        },
      }),
    60_000,
  )

  // A layout with a piece file only (no route file) still adds no path
  // segment, and is no page of its own (a layout given `path: '/'` makes the
  // router match the layout itself at `/`).
  test('a pathless layout with only a Vue component piece in a route group has no path', async () => {
    const root = await createApp({
      'src/routes/__root.ts': rootRoute('vue'),
      'src/routes/(group)/_layout.component.vue': `<template><slot /></template>\n`,
      'src/routes/(group)/_layout/inner.ts': fileRoute(
        '/(group)/_layout/inner',
        '{}',
        'vue',
      ),
    })
    const { generatedRouteTree } = await generate(root, { target: 'vue' })

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/(group)/_layout': '/',
      '/(group)/_layout/inner': '/inner',
    })
    // (the layout is no page: the router does not match it at `/`)
    expect(await matchesOf(generatedRouteTree, '/')).not.toContain(
      '/(group)/_layout',
    )
  })

  // Bug: a pathless layout with a lazy route file only (`foo/_auth.lazy.tsx`,
  // no `foo/_auth.tsx`) or a Vue piece only (`foo/_layout.component.vue`)
  // becomes a route without a file whose node is typed `static`, and the
  // route tree prints a `path` only for non-pathless nodes and for nodes
  // typed `pathless_layout` (src/generator.ts, the `path:` option of
  // `createUpdateRoutes`), so the layout loses the `/foo` prefix it carries
  // when nothing above it is a route. The route tree's types still say
  // `/foo/bar`. A layout with a route file (`foo/_auth.tsx`) is right.
  // Impact: the child route matches `/bar` instead of `/foo/bar`, and
  // links typed `/foo/bar` lead nowhere. Unlike the case of SPEC J1.14 (a
  // pathless layout with a route file under a lazy-only route: which route
  // is its parent), here the URL disagrees with the generated types.
  // Source: mutation testing.
  test.each<{
    name: string
    target: 'react' | 'vue'
    files: Record<string, string>
    child: string
  }>([
    {
      name: 'a lazy route file',
      target: 'react',
      files: {
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/foo/_auth.lazy.tsx': lazyFileRoute('/foo/_auth'),
        'src/routes/foo/_auth/bar.tsx': fileRoute('/foo/_auth/bar'),
      },
      child: '/foo/_auth/bar',
    },
    {
      name: 'a Vue component piece',
      target: 'vue',
      files: {
        'src/routes/__root.ts': rootRoute('vue'),
        'src/routes/foo/_layout.component.vue': `<template><slot /></template>\n`,
        'src/routes/foo/_layout/bar.ts': fileRoute(
          '/foo/_layout/bar',
          '{}',
          'vue',
        ),
      },
      child: '/foo/_layout/bar',
    },
  ])(
    'a pathless layout with only $name under a path keeps the path in the URLs of its children',
    async ({ target, files, child }) => {
      const root = await createApp(files)
      const { generatedRouteTree } = await generate(root, { target })

      expect((await urlsOf(generatedRouteTree))[child]).toBe('/foo/bar')
    },
  )

  // Control for the pin above (same harness).
  test('a pathless layout with a route file under a path keeps the path in the URLs of its children', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/foo/_auth.tsx': fileRoute('/foo/_auth'),
      'src/routes/foo/_auth/bar.tsx': fileRoute('/foo/_auth/bar'),
    })
    const { generatedRouteTree } = await generate(root)

    expect((await urlsOf(generatedRouteTree))['/foo/_auth/bar']).toBe(
      '/foo/bar',
    )
  })

  test('two sections with grandchildren give a valid route tree without formatting', async () => {
    const root = await appWithRoutes([
      'a.tsx',
      'a.b.tsx',
      'a.b.c.tsx',
      'd.tsx',
      'd.e.tsx',
      'd.e.f.tsx',
    ])
    const { generatedRouteTree } = await generate(root, {
      enableRouteTreeFormatting: false,
    })

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/a': '/a',
      '/a/b': '/a/b',
      '/a/b/c': '/a/b/c',
      '/d': '/d',
      '/d/e': '/d/e',
      '/d/e/f': '/d/e/f',
    })
  })
})

describe('conflicting routes', () => {
  // (Files are named absolute or project-relative, telling same-named files
  // apart, SPEC J1.7, §5.7.)
  test('routes with the same URL fail the generator with an error naming both files', async () => {
    const root = await appWithRoutes(['index.tsx', '_auth/index.tsx'])

    const error = await captureThrow(() => generate(root))
    const files = ['src/routes/index.tsx', 'src/routes/_auth/index.tsx']
    for (const file of files) {
      expectDiagnostic(error, {
        severity: 'error',
        file,
        root,
      })
    }
  })

  // The docs' example of a physical directory merged at the current level
  // (virtual-file-routes.md, "Merging Physical Routes at Current Level"): an
  // empty path prefix is no conflict by itself.
  test.each([
    { name: 'a directory only', mount: physical('features') },
    { name: 'an empty path prefix', mount: physical('', 'features') },
  ])(
    'a physical directory mounted with $name merges its routes at the current level',
    async ({ mount }) => {
      const root = await appWithRoutes([
        'about.tsx',
        'features/index.tsx',
        'features/contact.tsx',
      ])
      const { generatedRouteTree } = await generate(root, {
        virtualRouteConfig: virtualRootRoute('__root.tsx', [
          virtualRoute('/about', 'about.tsx'),
          mount,
        ]),
      })

      const urls = await urlsOf(generatedRouteTree)
      const routes = await routesOf(generatedRouteTree)
      expect(
        Object.fromEntries(
          Object.entries(routes).map(([id, file]) => [file, urls[id]]),
        ),
      ).toEqual({
        'routes/__root.tsx': '/',
        'routes/about.tsx': '/about',
        'routes/features/index.tsx': '/',
        'routes/features/contact.tsx': '/contact',
      })
    },
  )

  test('a route of a directory merged at the current level with the path of a virtual route fails the generator with an error naming both files', async () => {
    const root = await appWithRoutes(['about.tsx', 'features/about.tsx'])

    const error = await captureThrow(() =>
      generate(root, {
        virtualRouteConfig: virtualRootRoute('__root.tsx', [
          virtualRoute('/about', 'about.tsx'),
          physical('', 'features'),
        ]),
      }),
    )
    const files = ['src/routes/about.tsx', 'src/routes/features/about.tsx']
    for (const file of files) {
      expectDiagnostic(error, {
        severity: 'error',
        file,
        root,
      })
    }
  })

  // (A layout route file at the root of a directory merged at the current
  // level, `physical('', 'merged')` with `merged/route.tsx`: not tested; the
  // spec, J1.7, leaves virtual route configs the docs do not describe open.)

  // Bug: a route file and a layout route file of one route (`posts.tsx`,
  // `posts/route.tsx`) with a child route give two routes with one id
  // without an error; the router then throws "Duplicate routes found with
  // id: /posts", naming no file.
  // Source: src/model/build.ts `checkRouteFullPathUniqueness()` (checked
  // childless routes only, by full path).
  // Impact: the app fails at startup with no hint which files clash.
  test.each([
    { name: 'an index route', child: 'posts/index.tsx' },
    { name: 'a param route', child: 'posts/$id.tsx' },
  ])(
    'a route file and a layout route file of one route with $name under it fail the generator with an error naming both files',
    async ({ child }) => {
      const root = await appWithRoutes(['posts.tsx', 'posts/route.tsx', child])

      const error = await captureThrow(() => generate(root))
      for (const file of [
        'src/routes/posts.tsx',
        'src/routes/posts/route.tsx',
      ]) {
        expectDiagnostic(error, { severity: 'error', file, root })
      }
    },
  )

  // Bug: a route file the virtual route config uses for two routes is
  // imported twice by the route tree (one `Route` object updated with two
  // ids: the router's duplicate route invariant at startup), or the run fails
  // with an `ENOENT` of a temporary file (two concurrent writes of the file).
  // Source: src/generator.ts `processBatch()` (one update per scanned node,
  // in parallel), src/publish/atomic.ts (one temporary file per destination).
  // Impact: a config mistake gives a broken app or a bare fs error instead
  // of an error naming the file.
  test.each([
    {
      name: 'two route() entries',
      files: { 'src/routes/x.tsx': fileRoute('/a') },
      config: virtualRootRoute('__root.tsx', [
        virtualRoute('/a', 'x.tsx'),
        virtualRoute('/b', 'x.tsx'),
      ]),
      file: 'src/routes/x.tsx',
    },
    {
      name: 'two physical() mounts of one directory',
      files: { 'src/routes/sub/users.tsx': fileRoute('/a/users') },
      config: virtualRootRoute('__root.tsx', [
        physical('/a', 'sub'),
        physical('/b', 'sub'),
      ]),
      file: 'src/routes/sub/users.tsx',
    },
  ])(
    'a route file used for two routes by $name fails the generator with an error naming it',
    async ({ files, config, file }) => {
      // (the file already has the first route's id: nothing writes it)
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        ...files,
      })

      const error = await captureThrow(() =>
        generate(root, { virtualRouteConfig: config }),
      )
      expectDiagnostic(error, { severity: 'error', file, root })
    },
  )

  test('a route file a __virtual.ts subtree config uses while the directory scan also routes it fails the generator with an error naming it', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/x.tsx': fileRoute('/x'),
      'src/routes/sub/__virtual.ts': `import { route } from '@tanstack/virtual-file-routes'

export default [route('/y', '../x.tsx')]
`,
    })

    const error = await captureThrow(() => generate(root))
    expectDiagnostic(error, {
      severity: 'error',
      file: 'src/routes/x.tsx',
      root,
    })
  })
})

describe('route names', () => {
  test('routes whose names differ only by a leading @ get their own routes', async () => {
    const root = await appWithRoutes(['@me.tsx', 'me.tsx'])
    const { generatedRouteTree } = await generate(root)

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/@me': 'routes/@me.tsx',
      '/me': 'routes/me.tsx',
    })
  })

  test('a route file name with a space gets a route with the space in its URL', async () => {
    const root = await appWithRoutes(['about us.tsx'])
    const { generatedRouteTree } = await generate(root)

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      '/about us': '/about us',
    })
  })

  // Control: the test above (same harness, a name with a space).

  // Bug: the route tree writes route file paths and route ids into
  // single-quoted strings unescaped, so a route file whose name contains an
  // apostrophe ends the string: the route tree does not parse and the run
  // fails ("';' expected").
  // Source: src/utils.ts:1196 (`buildImportString`: `from '${source}'`),
  // src/generator.ts:703-706 (`id: '${node.path}'`, `path: '...'`).
  // Impact: an app with, e.g., `what's-new.tsx` gets no route tree until
  // the file is renamed.
  test('a route file name with an apostrophe gets a route with it in its URL', async () => {
    const root = await appWithRoutes(["what's-new.tsx"])
    const { generatedRouteTree } = await generate(root)

    expect(await urlsOf(generatedRouteTree)).toEqual({
      __root__: '/',
      "/what's-new": "/what's-new",
    })
  })

  // Control: "routes whose names differ only by a leading @ get their own
  // routes" above (same harness, two names the route tree tells apart).

  // Bug: routes whose paths differ only in characters that are not valid in
  // an identifier (`-`, `_`, `$`, a space) or in letter case get the same
  // variable in the route tree, which then declares it twice and fails to
  // parse ("Identifier has already been declared").
  // Source: src/utils.ts (routePathToVariable / getResolvedRouteNodeVariableName:
  // no deduplication of the generated names).
  // Impact: an app with, e.g., `about-us.tsx` and `aboutUs.tsx` fails to
  // build until one of the files is renamed.
  test.each([
    { files: ['about-us.tsx', 'aboutUs.tsx'], ids: ['/about-us', '/aboutUs'] },
    {
      files: ['blog.tsx', 'blog/_layout.tsx', 'blog/layout.tsx'],
      ids: ['/blog', '/blog/_layout', '/blog/layout'],
    },
    {
      files: ['users.tsx', 'users/$id.tsx', 'users/id.tsx'],
      ids: ['/users', '/users/$id', '/users/id'],
    },
    { files: ['a b.tsx', 'ab.tsx'], ids: ['/a b', '/ab'] },
  ])('routes $ids get their own routes', async ({ files, ids }) => {
    const root = await appWithRoutes(files)
    const { generatedRouteTree } = await generate(root)

    expect(Object.keys(await routesOf(generatedRouteTree)).sort()).toEqual(
      ['__root__', ...ids].sort(),
    )
  })
})

describe('token options', () => {
  test.each([
    {
      name: 'a JSON regex with the g flag',
      routeToken: { regex: 'layout', flags: 'g' },
    },
    { name: 'a RegExp with the g flag', routeToken: /layout/g },
  ] satisfies Array<Partial<Config> & { name: string }>)(
    'a routeToken that is $name matches every layout file',
    async ({ name: _name, ...config }) => {
      const files = ['a', 'b', 'c', 'd'].flatMap((dir) => [
        `${dir}/layout.tsx`,
        `${dir}/x.tsx`,
      ])
      const root = await appWithRoutes(files)
      const { generatedRouteTree } = await generate(root, config)

      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        ...Object.fromEntries(
          ['a', 'b', 'c', 'd'].flatMap((dir) => [
            [`/${dir}`, `routes/${dir}/layout.tsx`],
            [`/${dir}/x`, `routes/${dir}/x.tsx`],
          ]),
        ),
      })
    },
  )

  test('an indexToken that is a JSON regex with the g flag matches every index file', async () => {
    const root = await appWithRoutes(['a/home.tsx', 'b/home.tsx', 'c/home.tsx'])
    const { generatedRouteTree } = await generate(root, {
      indexToken: { regex: 'home', flags: 'g' },
    })

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/a/': 'routes/a/home.tsx',
      '/b/': 'routes/b/home.tsx',
      '/c/': 'routes/c/home.tsx',
    })
  })

  test.each([
    {
      name: 'a JSON regex with the i flag',
      indexToken: { regex: 'home', flags: 'i' },
    },
    { name: 'a RegExp with the i flag', indexToken: /home/i },
  ] satisfies Array<Partial<Config> & { name: string }>)(
    'an indexToken that is $name matches index files whatever their case',
    async ({ name: _name, ...config }) => {
      const root = await appWithRoutes(['a/Home.tsx', 'b/HOME.tsx'])
      const { generatedRouteTree } = await generate(root, config)

      expect(await routesOf(generatedRouteTree)).toEqual({
        __root__: 'routes/__root.tsx',
        '/a/': 'routes/a/Home.tsx',
        '/b/': 'routes/b/HOME.tsx',
      })
    },
  )
})

// (Warnings about param names that are no identifiers, e.g. `$user-name`:
// neither required nor forbidden, SPEC J1.12; not tested. The routes of
// such files: the invalid-param-names fixture, generator.test.ts.)

// (The route tree types of these shapes, FileRoutesByTo and
// routes by full path: integration/route-types.test.ts.)
