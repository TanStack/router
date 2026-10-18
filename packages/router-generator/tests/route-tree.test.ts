/** Controls of the shared route tree helpers (route-tree.ts). */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { loadLazyRoute, routeOptionsOf, routesOf, urlsOf } from './route-tree'

let root: string | undefined

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true })
    root = undefined
  }
})

/** Writes `tree` next to a routes directory with the given files. */
async function writeTree(tree: string, routeFiles: Array<string>) {
  root = await mkdtemp(path.join(tmpdir(), 'tsr-route-tree-'))
  await mkdir(path.join(root, 'routes'))
  for (const file of routeFiles) {
    await writeFile(path.join(root, 'routes', file), '')
  }
  await writeFile(path.join(root, 'routeTree.gen.ts'), tree)
  return path.join(root, 'routeTree.gen.ts')
}

const tree = (
  postsImport: string,
  lazyImport = './routes/posts.lazy',
  postsIndexParent = 'PostsRoute',
) => `
import { createFileRoute } from '@tanstack/react-router'
import { Route as rootRouteImport } from './routes/__root'
import { Route as PostsRouteImport } from '${postsImport}'
import { Route as PostsIndexRouteImport } from './routes/posts.index'

const AboutRouteImport = createFileRoute('/about')()
const PostsRoute = PostsRouteImport.update({
  id: '/posts',
  path: '/posts',
  getParentRoute: () => rootRouteImport,
} as any).lazy(() => import('${lazyImport}').then((d) => d.Route))
const PostsIndexRoute = PostsIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => ${postsIndexParent},
} as any)
const AboutRoute = AboutRouteImport.update({
  id: '/about',
  path: '/about',
  getParentRoute: () => rootRouteImport,
} as any)
const rootRouteChildren: any = {
  PostsRoute: PostsRoute._addFileChildren({ PostsIndexRoute }),
  AboutRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<any>()
`

describe('routesOf', () => {
  test.each(['./routes/posts', './routes/posts.tsx', './routes/posts.js'])(
    'returns the route ids and files of a route tree importing %s',
    async (postsImport) => {
      const treeFile = await writeTree(tree(postsImport), [
        '__root.tsx',
        'posts.tsx',
        'posts.lazy.tsx',
        'posts.index.tsx',
      ])
      expect(await routesOf(treeFile)).toEqual({
        __root__: 'routes/__root.tsx',
        '/posts': 'routes/posts.tsx',
        '/posts/': 'routes/posts.index.tsx',
        '/about': null,
      })
    },
  )

  test('fails on a static or dynamic import that does not resolve', async () => {
    const files = [
      '__root.tsx',
      'posts.tsx',
      'posts.lazy.tsx',
      'posts.index.tsx',
    ]
    await expect(
      routesOf(await writeTree(tree('./routes/missing'), files)),
    ).rejects.toThrow('"./routes/missing" does not resolve')
    await rm(root!, { recursive: true, force: true })
    await expect(
      routesOf(
        await writeTree(tree('./routes/posts', './routes/missing'), files),
      ),
    ).rejects.toThrow('"./routes/missing" does not resolve')
  })

  test('fails on a route tree that does not parse', async () => {
    const treeFile = await writeTree(tree('./routes/posts') + '\n}', [
      '__root.tsx',
      'posts.tsx',
      'posts.lazy.tsx',
    ])
    await expect(routesOf(treeFile)).rejects.toThrow()
  })

  test('derives ids and URL paths from getParentRoute, like router-core', async () => {
    const treeFile = await writeTree(tree('./routes/posts'), [
      '__root.tsx',
      'posts.tsx',
      'posts.lazy.tsx',
      'posts.index.tsx',
    ])
    expect(await urlsOf(treeFile)).toEqual({
      __root__: '/',
      '/posts': '/posts',
      '/posts/': '/posts/',
      '/about': '/about',
    })
  })

  test.each([
    { name: 'another route', parent: 'rootRouteImport' },
    { name: 'nothing', parent: 'undefined' },
  ])(
    'fails when a route nested under another gets $name from getParentRoute',
    async ({ parent }) => {
      const treeFile = await writeTree(
        tree('./routes/posts', './routes/posts.lazy', parent),
        ['__root.tsx', 'posts.tsx', 'posts.lazy.tsx', 'posts.index.tsx'],
      )
      await expect(routesOf(treeFile)).rejects.toThrow('getParentRoute')
    },
  )
})

describe('routeOptionsOf and loadLazyRoute', () => {
  const lazyTree = `
import { createFileRoute, createLazyRoute, lazyFn, lazyRouteComponent } from '@tanstack/react-router'
import { Route as rootRouteImport } from './routes/__root'

const AboutRoute = createFileRoute('/about')()
  .update({ id: '/about', path: '/about', getParentRoute: () => rootRouteImport } as any)
  .lazy(() =>
    import('./routes/about.lazy').then((d) => createLazyRoute('/about')({ component: d.default })),
  )
  .update({
    component: lazyRouteComponent(() => import('./routes/about.component')),
    loader: lazyFn(() => import('./routes/about.loader'), 'loader'),
  } as any)
export const routeTree = rootRouteImport._addFileChildren({ AboutRoute })._addFileTypes<any>()
`

  test('describe lazy options by the file their importer loads, with the default export by default', async () => {
    const treeFile = await writeTree(lazyTree, [
      '__root.tsx',
      'about.lazy.tsx',
      'about.component.tsx',
      'about.loader.ts',
    ])
    expect((await routeOptionsOf(treeFile))['/about']).toEqual({
      lazy: { file: 'routes/about.lazy.tsx' },
      component: {
        kind: 'lazyRouteComponent',
        file: 'routes/about.component.tsx',
        name: 'default',
      },
      loader: {
        kind: 'lazyFn',
        file: 'routes/about.loader.ts',
        name: 'loader',
      },
    })
  })

  test('the lazy route of a route is what its importer resolves to, with the router helpers it calls', async () => {
    const treeFile = await writeTree(lazyTree, [
      '__root.tsx',
      'about.lazy.tsx',
      'about.component.tsx',
      'about.loader.ts',
    ])
    const component = () => null
    expect(
      await loadLazyRoute(treeFile, '/about', (file) =>
        file === 'routes/about.lazy.tsx' ? { default: component } : {},
      ),
    ).toEqual({ options: { id: '/about', component } })
  })
})
