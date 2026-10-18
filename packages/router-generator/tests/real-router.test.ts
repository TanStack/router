/**
 * Generated route trees loaded by the real router: the routes
 * `@tanstack/react-router` builds from a generated tree (`routesById`, each
 * route's full path and `path` option) are the ones the shared route tree
 * helpers (route-tree.ts) read from the tree with their stub of the router.
 * This validates the helpers (route ids and URL paths derived from
 * `getParentRoute`, lazy route constructors) that the other tests rely on.
 * The app also type-checks with the real TypeScript compiler, and the route
 * ids of the tree's types are the router's.
 */
import { symlink } from 'node:fs/promises'
import path from 'node:path'
import { createRouter } from '@tanstack/react-router'
import { describe, expect, test } from 'vitest'
import {
  index,
  layout,
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { createApp, fileRoute, generate, lazyFileRoute, rootRoute } from './app'
import { routePathsOf, urlsOf } from './route-tree'
import { typeAssertions, typeErrorsOf } from './type-check'
import type { Config } from '../src'

/** This package's dependencies, for the app to import the router from. */
const nodeModules = path.resolve(import.meta.dirname, '../node_modules')

/** Route files whose ids the generator fixes. */
const routes = (files: Array<string>) =>
  Object.fromEntries(
    files.map((file) => [
      `src/routes/${file}`,
      file.includes('.lazy.') ? lazyFileRoute('/wrong') : fileRoute('/wrong'),
    ]),
  )

describe('the real router on a generated route tree', () => {
  test.each<{
    name: string
    files: Record<string, string>
    config?: Partial<Config>
  }>([
    {
      name: 'flat, directory, layout, pathless, group, lazy and param routes',
      files: {
        'src/routes/__root.tsx': rootRoute(),
        ...routes([
          'index.tsx',
          'about.tsx',
          'about.lazy.tsx',
          'contact.lazy.tsx',
          'posts.tsx',
          'posts.index.tsx',
          'posts.$postId.tsx',
          'posts_.$postId.edit.tsx',
          'blog/route.tsx',
          'blog/index.tsx',
          'blog/$slug.tsx',
          '_auth.tsx',
          '_auth/login.tsx',
          '_auth/_admin.tsx',
          '_auth/_admin/users.tsx',
          '(marketing)/route.tsx',
          '(marketing)/pricing.tsx',
          '(legal)/terms.tsx',
          '{-$locale}/help.tsx',
          'files.$.tsx',
          '[_]internal.tsx',
          'docs.[guide].tsx',
          'settings/_layout.lazy.tsx',
          'settings/_layout/profile.tsx',
        ]),
      },
    },
    {
      name: 'a virtual route config with layouts, an index and a physical mount',
      files: {
        'src/routes/root.tsx': rootRoute(),
        ...routes([
          'home.tsx',
          'posts/layout.tsx',
          'posts/list.tsx',
          'posts/detail.tsx',
          'auth-layout.tsx',
          'login.tsx',
          'legacy/about.tsx',
          'legacy/index.tsx',
        ]),
      },
      config: {
        virtualRouteConfig: virtualRootRoute('root.tsx', [
          index('home.tsx'),
          virtualRoute('/posts', 'posts/layout.tsx', [
            index('posts/list.tsx'),
            virtualRoute('$postId', 'posts/detail.tsx'),
          ]),
          layout('auth', 'auth-layout.tsx', [
            virtualRoute('/login', 'login.tsx'),
          ]),
          physical('/legacy', 'legacy'),
        ]),
      },
    },
  ])(
    '$name',
    async ({ files, config }) => {
      const root = await createApp(files)
      const { generatedRouteTree } = await generate(root, config)
      await symlink(nodeModules, path.join(root, 'node_modules'), 'junction')

      const { routeTree } = await import(/* @vite-ignore */ generatedRouteTree)
      const router = createRouter({ routeTree })
      const realRoutes = Object.values(router.routesById)

      expect(
        Object.fromEntries(
          realRoutes.map((route) => [route.id, route.fullPath]),
        ),
      ).toEqual(await urlsOf(generatedRouteTree))
      expect(
        Object.fromEntries(
          realRoutes.map((route) => [
            route.id,
            (route.options as { path?: string }).path,
          ]),
        ),
      ).toEqual(await routePathsOf(generatedRouteTree))

      const ids = realRoutes
        .map((route) => JSON.stringify(route.id))
        .join(' | ')
      expect(
        await typeErrorsOf(
          root,
          'src/checks.ts',
          `import type { FileRoutesById } from './routeTree.gen'
${typeAssertions}
export type Check = Expect<Equal<keyof FileRoutesById, ${ids}>>
`,
        ),
      ).toEqual([])
    },
    60_000,
  )
})
