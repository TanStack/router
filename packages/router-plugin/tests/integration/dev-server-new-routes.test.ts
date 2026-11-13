/**
 * Routes created while a Vite dev server runs, on a real page: a route file
 * the generator cannot handle yet is reported and is added once fixed (the
 * control of the Rsbuild pin in rsbuild-dev-server-new-routes.test.ts), and
 * edits of created and renamed routes, and of the root route, are hot
 * updates (scenarios: `generator-dev-scenarios.ts`).
 */
import { describeCreatedRoutes } from '../generator-dev-scenarios'

describeCreatedRoutes('vite')
