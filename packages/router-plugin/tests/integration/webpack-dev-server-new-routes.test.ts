/**
 * Routes created while a webpack dev server runs, on a real page (the
 * scenarios of rsbuild-dev-server-new-routes.test.ts and
 * dev-server-new-routes.test.ts through the router's webpack-family host,
 * which hands a created file to the compiler as a change of a file it knows
 * nothing of: no route's plan looks for files, so none waits for it).
 */
import { describeCreatedRoutes } from '../generator-dev-scenarios'

describeCreatedRoutes('webpack')
