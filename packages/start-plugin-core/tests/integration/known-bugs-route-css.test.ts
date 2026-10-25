/**
 * The route CSS rows (`route-css-cases.ts`, SPEC J2.22) on Vite's dev server
 * and in a Vite production build.
 */
import { routeCssSuite } from './route-css-cases'

// Bug: the code splitter keeps the bare CSS import in the route module,
// which the route tree imports eagerly: in dev the CSS is injected on every
// page once the client runs, and in a build it is merged into the entry's
// CSS, which every page links.
// Source: #4396; src/core/code-splitter/compilers.ts (router-plugin).
// Impact: a route's styles apply on every page of the app.
const routeModuleCss = [
  'shows-component',
  'shows-error',
  'shows-not-found',
  'shows-pending',
  'shows-nothing',
]

routeCssSuite('vite', { dev: routeModuleCss, build: routeModuleCss })
