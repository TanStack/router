/**
 * Generated route trees loaded by the real router: the app's router package
 * builds a router from the tree (`createRouter`), and each route gets the id,
 * full path and parent its file name or virtual route config gives it; URLs
 * match the expected routes, Vue pages render their single-file components,
 * and the tree's types agree with the router (checked by the real TypeScript
 * compiler with the real router types).
 */
import { describe, expect, test } from 'vitest'
import {
  index,
  layout,
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { createApp, fileRoute, generate, lazyFileRoute, rootRoute } from './app'
import { withRouteTree } from './route-tree'
import { typeAssertions, typeErrorsOf } from './type-check'
import type { Config } from '../src'

/** Route files whose ids the generator fixes. */
const routes = (files: Array<string>, target: Config['target'] = 'react') =>
  Object.fromEntries(
    files.map((file) => [
      `src/routes/${file}`,
      file.includes('.lazy.')
        ? lazyFileRoute('/wrong', '{}', target)
        : fileRoute('/wrong', '{}', target),
    ]),
  )

/** A Vue single-file component rendering `text`, and its child routes. */
const sfc = (text: string) => `<script setup lang="ts">
import { Outlet } from '@tanstack/vue-router'
</script>

<template>
  <p>${text}</p>
  <Outlet />
</template>
`

interface Case {
  name: string
  files: Record<string, string>
  config?: Partial<Config>
  /** Route id to its full path and its parent's id (null for the root). */
  expected: Record<string, [fullPath: string, parent: string | null]>
  /** URL to the id of the deepest route the router matches for it. */
  visits: Record<string, string>
  /** Vue only: URL to the texts its page renders, in order. */
  pages?: Record<string, Array<string>>
}

const cases: Array<Case> = [
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
        '(marketing)/pricing.tsx',
        '(legal)/terms.tsx',
        '{-$locale}/help.tsx',
        'files.$.tsx',
        '[_]internal.tsx',
        'docs.[guide].tsx',
        'settings/_layout.tsx',
        'settings/_layout/profile.tsx',
      ]),
    },
    expected: {
      __root__: ['/', null],
      '/': ['/', '__root__'],
      '/about': ['/about', '__root__'],
      '/contact': ['/contact', '__root__'],
      '/posts': ['/posts', '__root__'],
      '/posts/': ['/posts/', '/posts'],
      '/posts/$postId': ['/posts/$postId', '/posts'],
      '/posts_/$postId/edit': ['/posts/$postId/edit', '__root__'],
      '/blog': ['/blog', '__root__'],
      '/blog/': ['/blog/', '/blog'],
      '/blog/$slug': ['/blog/$slug', '/blog'],
      '/_auth': ['/', '__root__'],
      '/_auth/login': ['/login', '/_auth'],
      '/_auth/_admin': ['/', '/_auth'],
      '/_auth/_admin/users': ['/users', '/_auth/_admin'],
      '/(marketing)/pricing': ['/pricing', '__root__'],
      '/(legal)/terms': ['/terms', '__root__'],
      '/{-$locale}/help': ['/{-$locale}/help', '__root__'],
      '/files/$': ['/files/$', '__root__'],
      '/_internal': ['/_internal', '__root__'],
      '/docs/guide': ['/docs/guide', '__root__'],
      '/settings/_layout': ['/settings', '__root__'],
      '/settings/_layout/profile': ['/settings/profile', '/settings/_layout'],
    },
    visits: {
      '/': '/',
      '/about': '/about',
      '/contact': '/contact',
      '/posts': '/posts/',
      '/posts/1': '/posts/$postId',
      '/posts/1/edit': '/posts_/$postId/edit',
      '/blog/hello': '/blog/$slug',
      '/login': '/_auth/login',
      '/users': '/_auth/_admin/users',
      '/pricing': '/(marketing)/pricing',
      '/terms': '/(legal)/terms',
      '/help': '/{-$locale}/help',
      '/fr/help': '/{-$locale}/help',
      '/files/a/b': '/files/$',
      '/_internal': '/_internal',
      '/docs/guide': '/docs/guide',
      '/settings/profile': '/settings/_layout/profile',
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
    expected: {
      __root__: ['/', null],
      '/': ['/', '__root__'],
      '/posts': ['/posts', '__root__'],
      '/posts/': ['/posts/', '/posts'],
      '/posts/$postId': ['/posts/$postId', '/posts'],
      '/_auth': ['/', '__root__'],
      '/_auth/login': ['/login', '/_auth'],
      '/legacy/about': ['/legacy/about', '__root__'],
      '/legacy/': ['/legacy/', '__root__'],
    },
    visits: {
      '/': '/',
      '/posts': '/posts/',
      '/posts/1': '/posts/$postId',
      '/login': '/_auth/login',
      '/legacy/about': '/legacy/about',
      '/legacy': '/legacy/',
    },
  },
  {
    name: 'a Vue app with route files and component pieces',
    config: { target: 'vue' },
    files: {
      'src/routes/__root.ts': rootRoute('vue'),
      'src/routes/__root.component.vue': sfc('root'),
      ...routes(
        [
          'index.ts',
          'posts.ts',
          'posts.$postId.ts',
          '_auth.ts',
          '_auth/login.ts',
        ],
        'vue',
      ),
      'src/routes/index.component.vue': sfc('home'),
      'src/routes/posts.component.vue': sfc('posts'),
      'src/routes/posts.$postId.component.vue': sfc('post'),
      'src/routes/_auth.component.vue': sfc('auth'),
      'src/routes/_auth/login.component.vue': sfc('login'),
      // A route with a component piece and no route file
      'src/routes/about.component.vue': sfc('about'),
    },
    expected: {
      __root__: ['/', null],
      '/': ['/', '__root__'],
      '/about': ['/about', '__root__'],
      '/posts': ['/posts', '__root__'],
      '/posts/$postId': ['/posts/$postId', '/posts'],
      '/_auth': ['/', '__root__'],
      '/_auth/login': ['/login', '/_auth'],
    },
    visits: {
      '/': '/',
      '/about': '/about',
      '/posts': '/posts',
      '/posts/1': '/posts/$postId',
      '/login': '/_auth/login',
    },
    pages: {
      '/': ['root', 'home'],
      '/about': ['root', 'about'],
      '/posts/1': ['root', 'posts', 'post'],
      '/login': ['root', 'auth', 'login'],
    },
  },
]

/** Types for Vue single-file component imports, as in a Vue app. */
const vueShim = `declare module '*.vue' {
  const component: unknown
  export default component
}
`

/** The texts of the `<p>` elements of server-rendered `html`, in order. */
const paragraphs = (html: string) =>
  [...html.matchAll(/<p>([^<]*)<\/p>/g)].map((match) => match[1])

/**
 * Generates the app of `testCase` and checks the router over its route tree
 * and the tree's types against the expected routes.
 */
async function checkApp({ files, config, expected, visits, pages }: Case) {
  const root = await createApp({ ...files, 'src/vue-shim.d.ts': vueShim })
  const { generatedRouteTree } = await generate(root, config)

  await withRouteTree(generatedRouteTree, async (tree) => {
    const { router } = tree
    expect(
      Object.fromEntries(
        Object.values(router.routesById).map((route) => [
          route.id,
          [route.fullPath, route.parentRoute?.id ?? null],
        ]),
      ),
    ).toEqual(expected)
    expect(
      Object.fromEntries(
        Object.keys(visits).map((url) => [
          url,
          router.matchRoutes(url).at(-1)?.routeId,
        ]),
      ),
    ).toEqual(visits)
    for (const [url, texts] of Object.entries(pages ?? {})) {
      expect(paragraphs(await tree.renderAt(url))).toEqual(texts)
    }
  })

  // The tree's types: the same route ids, and for each route the same full
  // path and parent as the router's.
  const ids = Object.keys(expected)
  const checks = ids.map((id, i) => {
    const [fullPath, parent] = expected[id]!
    const route = `FileRoutesById[${JSON.stringify(id)}]`
    const actual = `[${JSON.stringify(id)}, ${route}['fullPath'], ${parent === null ? 'null' : `${route}['parentRoute']['id']`}]`
    const wanted = JSON.stringify([id, fullPath, parent])
    // (the assignment names the types of a route that differ)
    return `export type Check${i} = Expect<Equal<${actual}, ${wanted}>>
export const check${i}: ${wanted} = null as unknown as ${actual}`
  })
  expect(
    await typeErrorsOf(
      root,
      'src/checks.ts',
      `/// <reference path="./vue-shim.d.ts" />
import type { FileRoutesById } from './routeTree.gen'
${typeAssertions}
export type Ids = Expect<Equal<keyof FileRoutesById, ${ids.map((id) => JSON.stringify(id)).join(' | ')}>>
${checks.join('\n')}
`,
    ),
  ).toEqual([])
}

describe('the real router on a generated route tree', () => {
  test.each(cases)('$name', checkApp, 60_000)

  // Bug: the route tree types the layout route of a route group directory
  // (`(marketing)/route.tsx`) with `fullPath: ''` in `FileRoutesByPath`,
  // while the router gives it the full path `/` (a pathless layout,
  // `_auth.tsx`, is typed `/`, and agrees).
  // Source: src/utils.ts:929-950 (`inferFullPath`: `/(marketing)` without
  // its group is `/`, which is not an index path, so its trailing slash is
  // dropped), printed at src/utils.ts:1260.
  // Impact: `Route.fullPath` and the types derived from it (`from` of
  // links and hooks) say `''` in such a layout while the app sees `/`.
  test.fails(
    'the layout route of a route group directory has the full path of the router in the types',
    () =>
      checkApp({
        name: 'a route group layout',
        files: {
          'src/routes/__root.tsx': rootRoute(),
          ...routes(['(marketing)/route.tsx', '(marketing)/pricing.tsx']),
        },
        expected: {
          __root__: ['/', null],
          '/(marketing)': ['/', '__root__'],
          '/(marketing)/pricing': ['/pricing', '/(marketing)'],
        },
        visits: { '/pricing': '/(marketing)/pricing' },
      }),
    60_000,
  )
})
