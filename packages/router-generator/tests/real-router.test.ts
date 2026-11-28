/**
 * Generated route trees loaded by the real router: the app's router package
 * builds a router from the tree (`createRouter`), and each route gets the id,
 * full path and parent its file name or virtual route config gives it; URLs
 * match the expected routes and pages render (React with react-dom). The
 * trees' types (J1.13) are checked against the same routes in
 * integration/route-types.test.ts. Apps: real-router-cases.ts; helpers:
 * real-router.ts.
 */
import { describe } from 'vitest'
import { checkApp } from './real-router'
import {
  groupLayout,
  lazyOnlyPathlessLayout,
  shapeCases,
} from './real-router-cases'
import { test } from './test'

// (the frameworks' pages: real-router-frameworks.test.ts)
describe('the real router on a generated route tree', () => {
  // 60 s: a generated tree loaded and rendered by the real router in a Vite server
  test.for(shapeCases)(
    '$name',
    { timeout: 60_000 },
    (testCase, { appRoot, routeTreeHost }) =>
      checkApp({ appRoot, routeTreeHost }, testCase, { types: false }),
  )

  // 60 s: a generated tree loaded and rendered by the real router in a Vite server
  test(
    'the layout route of a route group directory adds no path segment and renders around its children',
    ({ appRoot, routeTreeHost }) =>
      checkApp({ appRoot, routeTreeHost }, groupLayout, { types: false }),
    60_000,
  )

  // Bug: a pathless layout with only a lazy route file
  // (`settings/_layout.lazy.tsx`, no `settings/_layout.tsx`) gets no `path`
  // in the route tree, so the router drops the `/settings` prefix its
  // directory gives it: the child matches `/profile`, not
  // `/settings/profile`. The tree's types say `/settings/profile`. Lazy-only
  // route files are supported (guide/code-splitting.md:222-224: a virtual
  // route anchors the code-split files; SPEC J1.8). Same bug as the G1 pin
  // in route-paths.test.ts, checked here with matching, rendering and types.
  // Source: src/generator.ts (the `path:` option of `createUpdateRoutes`:
  // printed only for non-pathless nodes and nodes typed `pathless_layout`;
  // a layout without a route file is typed `static`).
  // Impact: the pages under such a layout are served at the wrong URL, and
  // typed links to them lead nowhere.
  // 60 s: a generated tree loaded and rendered by the real router in a Vite server
  test(
    'a pathless layout with only a lazy route file keeps its directory path',
    ({ appRoot, routeTreeHost }) =>
      checkApp({ appRoot, routeTreeHost }, lazyOnlyPathlessLayout, {
        types: false,
      }),
    60_000,
  )
})
