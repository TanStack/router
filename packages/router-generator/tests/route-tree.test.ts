/** Controls of the shared `routesOf` helper (route-tree.ts). */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { routesOf } from './route-tree'

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

const tree = (postsImport: string, lazyImport = './routes/posts.lazy') => `
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
  getParentRoute: () => PostsRoute,
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
})
