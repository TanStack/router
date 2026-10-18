/**
 * Routes created while an Rsbuild dev server runs, on a real page: a route
 * file broken by an edit is reported and comes back once fixed, and edits of
 * created and renamed routes, and of the root route, are hot updates
 * (scenarios: `generator-dev-scenarios.ts`; the Vite counterpart is
 * dev-server-new-routes.test.ts). A route file created before it exports a
 * valid `Route` is pinned in known-bugs-rsbuild-generator.test.ts.
 */
import { describeCreatedRoutes } from '../generator-dev-scenarios'

describeCreatedRoutes('rsbuild', { pinCreatedBrokenRouteFiles: true })
