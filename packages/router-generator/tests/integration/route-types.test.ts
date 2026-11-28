/**
 * The types of generated route trees (SPEC J1.13), checked by the real
 * TypeScript compiler with the real router types: the trees of the apps of
 * real-router-cases.ts type the routes the real router builds from them
 * (real-router.test.ts, real-router-frameworks.test.ts) alike, and `to` and
 * full paths stand for the right routes. Slow tier: one TypeScript program
 * per app (each tree augments the router's types globally).
 */
import { describe, expect } from 'vitest'
import { fileRoute, generate, lazyFileRoute, rootRoute } from '../app'
import { checkApp } from '../real-router'
import {
  childlessLayoutCase,
  childlessLayouts,
  frameworkCases,
  groupLayout,
  lazyOnlyAnchorLayoutInDirectory,
  lazyOnlyPathlessLayout,
  shapeCases,
} from '../real-router-cases'
import { typeAssertions, typeErrorsOf } from '../type-check'
import { test } from '../test'

describe('route tree types agree with the router', () => {
  test.for(
    [...shapeCases, ...frameworkCases].filter(
      (testCase) => testCase.types !== false,
    ),
  )('$name', { timeout: 60_000 }, (testCase, { appRoot, routeTreeHost }) =>
    checkApp({ appRoot, routeTreeHost }, testCase, { runtime: false }),
  )

  // Bug: the route tree types the layout route of a route group directory
  // (`(marketing)/route.tsx`) with `fullPath: ''` in `FileRoutesByPath`,
  // while the router gives it the full path `/` (real-router.test.ts, "the
  // layout route of a route group directory adds no path segment"; a
  // pathless layout, `_auth.tsx`, is typed `/`, and agrees).
  // Source: src/utils.ts:929-950 (`inferFullPath`: `/(marketing)` without
  // its group is `/`, which is not an index path, so its trailing slash is
  // dropped), printed at src/utils.ts:1260.
  // Impact: `Route.fullPath` and the types derived from it (`from` of
  // links and hooks) say `''` in such a layout while the app sees `/`.
  test(
    'the layout route of a route group directory has the full path of the router in the types',
    ({ appRoot, routeTreeHost }) =>
      checkApp({ appRoot, routeTreeHost }, groupLayout, { runtime: false }),
    60_000,
  )

  // (the routes of these cases: route-paths.test.ts and real-router.test.ts,
  // with the bugs the last two pin)
  test.for(childlessLayouts)(
    'a pathless layout without child routes yet ($name) next to the index route has the routes of the router in the types',
    { timeout: 60_000 },
    (layout, { appRoot, routeTreeHost }) =>
      checkApp({ appRoot, routeTreeHost }, childlessLayoutCase(layout), {
        runtime: false,
      }),
  )

  test.for([lazyOnlyAnchorLayoutInDirectory, lazyOnlyPathlessLayout])(
    '$name has the routes of the router in the types',
    { timeout: 60_000 },
    (testCase, { appRoot, routeTreeHost }) =>
      checkApp({ appRoot, routeTreeHost }, testCase, { runtime: false }),
  )
})

// The route tree's types, checked by the real TypeScript compiler with the
// real router types: the whole app type-checks, and a `to` or full path
// stands for the right route (its `id`).
describe('FileRoutesByTo', () => {
  test('`to` of an index route is the index route, not a route under pathless layouts with the same path', async ({
    appWithRoutes,
  }) => {
    const root = await appWithRoutes([
      'posts/index.tsx',
      '_a.tsx',
      '_a/_b.tsx',
      '_a/_b/posts.tsx',
    ])
    await generate(root)

    expect(
      await typeErrorsOf(
        root,
        'src/checks.ts',
        `import type { FileRoutesByTo } from './routeTree.gen'
${typeAssertions}
export type Check = Expect<Equal<FileRoutesByTo['/posts']['id'], '/posts/'>>
`,
      ),
    ).toEqual([])
  }, 30_000)

  test('`to` of a route is the route, not its own pathless layout', async ({
    appWithRoutes,
  }) => {
    const root = await appWithRoutes([
      'foo.tsx',
      'foo/_auth.tsx',
      'foo/_auth/bar.tsx',
    ])
    await generate(root)

    expect(
      await typeErrorsOf(
        root,
        'src/checks.ts',
        `import type { FileRoutesByTo } from './routeTree.gen'
${typeAssertions}
export type Check = Expect<Equal<FileRoutesByTo['/foo']['id'], '/foo'>>
`,
      ),
    ).toEqual([])
  }, 30_000)
})

// Bug: a route file named `root` with child routes is given the route tree's
// own name for the root route's children (`RootRouteChildren`), so the tree
// declares it twice: the children of `routeTree` are typed as the `root`
// route's (`/root/settings` in place of `/root`), and a tree printed without
// the `// @ts-nocheck` header (`routeTreeFileHeader`) fails to type-check.
// Source: src/model/build.ts (`reservedNames`: the printer's own names
// a route's names must not take).
// Impact: a legal route name breaks the types of the tree's children.
describe('the root route children', () => {
  test('a route named `root` with child routes is a child of the root route in the types', async ({
    createApp,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/root.tsx': fileRoute('/root'),
      'src/routes/root.settings.tsx': fileRoute('/root/settings'),
    })
    await generate(root, { routeTreeFileHeader: [] })

    expect(
      await typeErrorsOf(
        root,
        'src/checks.ts',
        `import type { routeTree } from './routeTree.gen'
${typeAssertions}
type Children = (typeof routeTree)['children']
export type Check = Expect<Equal<NonNullable<Children>[keyof NonNullable<Children>]['id'], '/root'>>
`,
      ),
    ).toEqual([])
  }, 30_000)
})

// (Through the router's public lookup by full path on `typeof routeTree`;
// the tree's own type names are free.)
describe('routes by full path', () => {
  test('the full path `/` is the index route, not a pathless layout with only a lazy file', async ({
    createApp,
  }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
      'src/routes/_auth.lazy.tsx': lazyFileRoute('/_auth'),
      'src/routes/_auth/login.tsx': fileRoute('/_auth/login'),
    })
    await generate(root)

    expect(
      await typeErrorsOf(
        root,
        'src/checks.ts',
        `import type { RouteByPath } from '@tanstack/router-core'
import type { routeTree } from './routeTree.gen'
${typeAssertions}
export type Check = Expect<Equal<RouteByPath<typeof routeTree, '/'>['id'], '/'>>
`,
      ),
    ).toEqual([])
  }, 30_000)
})
