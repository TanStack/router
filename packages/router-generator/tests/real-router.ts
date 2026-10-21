/**
 * Shared helper of the real-router tests: generates an app, loads its route
 * tree with the real router (route-tree.ts) and checks ids, full paths,
 * parents, matching, rendered pages and the tree's types against literal
 * expectations.
 */
import { expect } from 'vitest'
import { createApp, fileRoute, generate, lazyFileRoute } from './app'
import { withRouteTree } from './route-tree'
import { typeAssertions, typeErrorsOf } from './type-check'
import type { Config } from '../src'

/** Route files whose ids the generator fixes. */
export const routes = (
  files: Array<string>,
  target: Config['target'] = 'react',
) =>
  Object.fromEntries(
    files.map((file) => [
      `src/routes/${file}`,
      file.includes('.lazy.')
        ? lazyFileRoute('/wrong', '{}', target)
        : fileRoute('/wrong', '{}', target),
    ]),
  )

/** A Vue single-file component rendering `text`, and its child routes. */
export const sfc = (text: string) => `<script setup lang="ts">
import { Outlet } from '@tanstack/vue-router'
</script>

<template>
  <p>${text}</p>
  <Outlet />
</template>
`

/**
 * A route file for `target` (React or Solid) whose component renders
 * `<p>text</p>` and, with `outlet`, its child routes; `constructor` is
 * `createRootRoute`, `createFileRoute` or `createLazyFileRoute` (whose id
 * the generator fixes).
 */
export const page = (
  target: 'react' | 'solid',
  constructor: string,
  text: string,
  outlet = false,
) => `${target === 'solid' ? '/** @jsxImportSource solid-js */\n' : ''}import { Outlet, ${constructor} } from '@tanstack/${target}-router'

export const Route = ${constructor === 'createRootRoute' ? constructor : `${constructor}('/wrong')`}({
  component: () => (
    <>
      <p>${text}</p>
      ${outlet ? '<Outlet />' : ''}
    </>
  ),
})
`

/**
 * An app for `target` whose routes render pages: a root layout, an index, a
 * route with a lazy component, a lazy-only route, a route with a child, and
 * a pathless layout with a child.
 */
export const pagesApp = (target: 'react' | 'solid'): Case => ({
  name: `a ${target} app rendering its pages`,
  config: { target },
  files: {
    'src/routes/__root.tsx': page(target, 'createRootRoute', 'root', true),
    'src/routes/index.tsx': page(target, 'createFileRoute', 'home'),
    'src/routes/about.tsx': fileRoute('/wrong', '{}', target),
    'src/routes/about.lazy.tsx': page(target, 'createLazyFileRoute', 'about'),
    'src/routes/contact.lazy.tsx': page(
      target,
      'createLazyFileRoute',
      'contact',
    ),
    'src/routes/posts.tsx': page(target, 'createFileRoute', 'posts', true),
    'src/routes/posts.$postId.tsx': page(target, 'createFileRoute', 'post'),
    'src/routes/_auth.tsx': page(target, 'createFileRoute', 'auth', true),
    'src/routes/_auth/login.tsx': page(target, 'createFileRoute', 'login'),
  },
  expected: {
    __root__: ['/', null],
    '/': ['/', '__root__'],
    '/about': ['/about', '__root__'],
    '/contact': ['/contact', '__root__'],
    '/posts': ['/posts', '__root__'],
    '/posts/$postId': ['/posts/$postId', '/posts'],
    '/_auth': ['/', '__root__'],
    '/_auth/login': ['/login', '/_auth'],
  },
  visits: {
    '/': '/',
    '/about': '/about',
    '/contact': '/contact',
    '/posts/1': '/posts/$postId',
    '/login': '/_auth/login',
  },
  pages: {
    '/': ['root', 'home'],
    '/about': ['root', 'about'],
    '/contact': ['root', 'contact'],
    '/posts/1': ['root', 'posts', 'post'],
    '/login': ['root', 'auth', 'login'],
  },
  // (React: the types of the same routes are checked by the first case of
  // integration/route-types.test.ts)
  types: target === 'solid',
})

export interface Case {
  name: string
  files: Record<string, string>
  config?: Partial<Config>
  /** Route id to its full path and its parent's id (null for the root). */
  expected: Record<string, [fullPath: string, parent: string | null]>
  /** URL to the id of the deepest route the router matches for it. */
  visits: Record<string, string>
  /** URL to the texts of the paragraphs its page renders, in order. */
  pages?: Record<string, Array<string>>
  /** False when other cases already check the types of the same routes. */
  types?: boolean
}

/** Types for Vue single-file component imports, as in a Vue app. */
const vueShim = `declare module '*.vue' {
  const component: unknown
  export default component
}
`

/** The texts of the `<p>` elements of server-rendered `html`, in order. */
const paragraphs = (html: string) =>
  [...html.matchAll(/<p[^>]*>([^<]*)<\/p>/g)].map((match) => match[1])

/**
 * Generates the app of a case and checks the router over its route tree
 * (`runtime`) and the tree's types (`types`) against the expected routes.
 */
export async function checkApp(
  { files, config, expected, visits, pages }: Case,
  { runtime = true, types = true, client = false } = {},
) {
  const root = await createApp({ ...files, 'src/vue-shim.d.ts': vueShim })
  const { generatedRouteTree } = await generate(root, config)

  if (runtime) {
    await checkRouter(generatedRouteTree, { expected, visits, pages }, client)
  }
  if (types) {
    await checkTypes(root, expected)
  }
}

/** Checks the router over the route tree at `treeFile`. */
async function checkRouter(
  treeFile: string,
  { expected, visits, pages }: Pick<Case, 'expected' | 'visits' | 'pages'>,
  client: boolean,
) {
  await withRouteTree(treeFile, async (tree) => {
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
      if (client) {
        expect(paragraphs(await tree.renderClientAt(url))).toEqual(texts)
      }
    }
  })
}

/**
 * Checks the types of the route tree of the app at `root`: the same route
 * ids, and for each route the same full path and parent as `expected`.
 */
async function checkTypes(root: string, expected: Case['expected']) {
  expect(
    await typeErrorsOf(
      root,
      'src/checks.ts',
      `/// <reference path="./vue-shim.d.ts" />
${routeTypeChecks('./routeTree.gen', expected)}`,
    ),
  ).toEqual([])
}

/**
 * A module that type-checks only if the route tree `tree` (an import
 * specifier) types the routes of `expected` (route id to full path and
 * parent id) alike: the same route ids, and for each route the same full
 * path and parent. The routes are read through the router's public type
 * API on `typeof routeTree` (`RouteIds`, `RouteById`), not through the
 * names of the types the tree declares (free, SPEC §5.1).
 */
export function routeTypeChecks(
  tree: string,
  expected: Record<string, readonly [string, string | null, ...Array<unknown>]>,
) {
  const ids = Object.keys(expected)
  const checks = ids.map((id, i) => {
    const [fullPath, parent] = expected[id]!
    const route = `RouteById<Tree, ${JSON.stringify(id)}>`
    const actual = `[${JSON.stringify(id)}, ${route}['fullPath'], ${parent === null ? 'null' : `${route}['parentRoute']['id']`}]`
    const wanted = JSON.stringify([id, fullPath, parent])
    // (the assignment names the types of a route that differ)
    return `export type Check${i} = Expect<Equal<${actual}, ${wanted}>>
export const check${i}: ${wanted} = null as unknown as ${actual}`
  })
  return `import type { RouteById, RouteIds } from '@tanstack/router-core'
import type { routeTree } from ${JSON.stringify(tree)}
${typeAssertions}
type Tree = typeof routeTree
export type Ids = Expect<Equal<RouteIds<Tree>, ${ids.map((id) => JSON.stringify(id)).join(' | ')}>>
${checks.join('\n')}
`
}
