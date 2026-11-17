/**
 * The route CSS rows (`route-css-cases.ts`, SPEC J2.22) on Vite's dev server
 * and in a Vite production build.
 */
import { routeCssSuite } from './route-css-cases'

// Source: #4396; main's router-plugin src/core/code-splitter/compilers.ts.
// On main, a route's styles apply on every page of the app.
const routeModuleCss = [
  'shows-component',
  'shows-error',
  'shows-not-found',
  'shows-pending',
  'shows-nothing',
]

routeCssSuite('vite', { dev: routeModuleCss, build: routeModuleCss })
