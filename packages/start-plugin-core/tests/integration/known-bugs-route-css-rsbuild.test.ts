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

// Bug: Start's Rsbuild client manifest counts a chunk as available to a
// chunk when any one of its chunk groups has it, not every one: the chunk
// of the module both routes share gets the copy of the module it imports
// in each route's chunk as a dependency, so each route's manifest entry
// lists the other route's chunk and its CSS.
// Source: #8780; computeStaticDependencyChunks,
// src/rsbuild/normalized-client-build.ts.
// Impact: the page Start renders at /shares-module-a links the stylesheet
// of /shares-module-c (and preloads its chunk), whose styles apply there;
// in dev and in a build.
const siblingChunks = ['shares-module-a', 'shares-module-c']

routeCssSuite('rsbuild', {
  dev: [...routeModuleCss, ...siblingChunks],
  build: [...routeModuleCss, ...siblingChunks],
})
