/**
 * The route CSS rows (`route-css-cases.ts`, SPEC J2.22) on Rsbuild's dev
 * server and in an Rsbuild production build.
 */
import { routeCssSuite } from './route-css-cases'

// Bug: the code splitter keeps the bare CSS import in the route module,
// which the route tree imports eagerly, so the CSS is in the entry's CSS
// (see known-bugs-route-css.test.ts).
// Source: #4396; src/core/code-splitter/compilers.ts (router-plugin).
// Impact: a route's styles apply on every page of the app.
const routeModuleCss = [
  'shows-component',
  'shows-error',
  'shows-not-found',
  'shows-pending',
  'shows-nothing',
]

// (The `shares-module-*` rows, #8780: Start's Rsbuild client manifest
// counted a chunk as available to a chunk when any one of its chunk groups
// had it, so the chunk of the module both routes share depended on each
// route's copy of the module it imports, and each route's manifest entry
// listed the other route's chunk and its CSS. Fixed in
// computeStaticDependencyChunks, src/rsbuild/normalized-client-build.ts.)

routeCssSuite('rsbuild', {
  dev: routeModuleCss,
  build: routeModuleCss,
})
