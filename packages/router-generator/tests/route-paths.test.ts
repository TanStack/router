/**
 * The URLs routes get from their file names and virtual route configs:
 * escaped underscores (`[_]`), literal underscores in virtual paths, route
 * groups, pathless layouts, and token and param validation, read from the
 * evaluated route tree.
 */
import { readFile } from 'node:fs/promises'
import { describe, expect, test, vi } from 'vitest'
import {
  index,
  layout,
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { parseSync } from 'vite'
import { createApp, fileRoute, generate, rootRoute } from './app'
import { routesOf, urlsOf } from './route-tree'
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

  test('a pathless layout without child routes yet is added to the route tree', async () => {
    const root = await appWithRoutes(['about.tsx', '_auth.tsx'])
    const { generatedRouteTree } = await generate(root)

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/about': 'routes/about.tsx',
      '/_auth': 'routes/_auth.tsx',
    })
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

describe('route names', () => {
  test('routes whose names differ only by a leading @ get their own routes', async () => {
    const root = await appWithRoutes(['@B.tsx', 'B.tsx'])
    const { generatedRouteTree } = await generate(root)

    expect(await routesOf(generatedRouteTree)).toEqual({
      __root__: 'routes/__root.tsx',
      '/@B': 'routes/@B.tsx',
      '/B': 'routes/B.tsx',
    })
  })

  // Control: the test above (same harness, two names the route tree tells
  // apart).

  // Bug: routes whose paths differ only in characters that are not valid in
  // an identifier (`-`, `_`, `$`, a space) or in letter case get the same
  // variable in the route tree, which then declares it twice and fails to
  // parse ("Identifier has already been declared").
  // Source: src/utils.ts (routePathToVariable / getResolvedRouteNodeVariableName:
  // no deduplication of the generated names).
  // Impact: an app with, e.g., `about-us.tsx` and `aboutUs.tsx` fails to
  // build until one of the files is renamed.
  test.fails.each([
    { files: ['about-us.tsx', 'aboutUs.tsx'], ids: ['/about-us', '/aboutUs'] },
    {
      files: ['blog.tsx', 'blog/_layout.tsx', 'blog/layout.tsx'],
      ids: ['/blog', '/blog/_layout', '/blog/layout'],
    },
    {
      files: ['users.tsx', 'users/$id.tsx', 'users/id.tsx'],
      ids: ['/users', '/users/$id', '/users/id'],
    },
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
    { name: 'a RegExp with the g and y flags', routeToken: /layout/gy },
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
})

describe('param names', () => {
  test('only invalid param names in braces get a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = await appWithRoutes([
      '{-$locale}/about.tsx',
      'posts/{$postId}.tsx',
      'files/prefix{$}.tsx',
      'opt/{-$}.tsx',
      'users/user-{$user-name}.tsx',
    ])
    try {
      await generate(root, { disableLogging: false })
      const warnings = warn.mock.calls
        .map((call) => call.join(' '))
        .filter((message) => message.includes('param'))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('user-name')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('FileRoutesByTo', () => {
  /**
   * The route each `to` of the route tree's `FileRoutesByTo` interface
   * navigates to, by route id (from `FileRoutesById`).
   */
  async function routeIdsByTo(treeFile: string) {
    const { program } = parseSync(
      'routeTree.gen.ts',
      await readFile(treeFile, 'utf8'),
    )
    const members = (name: string) => {
      const body = program.body
        .map((statement) =>
          statement.type === 'ExportNamedDeclaration'
            ? statement.declaration
            : statement,
        )
        .find(
          (statement: any) =>
            statement?.type === 'TSInterfaceDeclaration' &&
            statement.id.name === name,
        ) as any
      return Object.fromEntries(
        body.body.body.map((member: any) => [
          member.key.value ?? member.key.name,
          member.typeAnnotation.typeAnnotation.exprName.name,
        ]),
      )
    }
    const idsByVariable = Object.fromEntries(
      Object.entries(members('FileRoutesById')).map(([id, variable]) => [
        variable,
        id,
      ]),
    )
    return Object.fromEntries(
      Object.entries(members('FileRoutesByTo')).map(([to, variable]) => [
        to,
        idsByVariable[variable as string],
      ]),
    )
  }

  test('`to` of an index route is the index route, not a route under pathless layouts with the same path', async () => {
    const root = await appWithRoutes([
      'posts/index.tsx',
      '_a.tsx',
      '_a/_b.tsx',
      '_a/_b/posts.tsx',
    ])
    const { generatedRouteTree } = await generate(root)

    expect((await routeIdsByTo(generatedRouteTree))['/posts']).toBe('/posts/')
  })

  test('`to` of a route is the route, not its own pathless layout', async () => {
    const root = await appWithRoutes([
      'foo.tsx',
      'foo/_auth.tsx',
      'foo/_auth/bar.tsx',
    ])
    const { generatedRouteTree } = await generate(root)

    expect((await routeIdsByTo(generatedRouteTree))['/foo']).toBe('/foo')
  })
})
