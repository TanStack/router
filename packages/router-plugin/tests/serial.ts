/**
 * The page openers of the serial files (TEST-TOOLS-DESIGN.md, Decision B):
 * each registers its close with Vitest's global `onTestFinished` when it is
 * called, while the calling test runs. The files of `integration-concurrent`
 * open them through the fixtures of `./test` instead (eslint.config.js).
 */
import { openRouteHmrPageAt } from './route-hmr-page'
import { closeAtEnd } from './test-end'
import { openWebpackHmrPageAt } from './webpack-hmr-page'
import type { RouteHmrPageOptions } from './route-hmr-page'
import type { WebpackHmrPageOptions } from './webpack-hmr-page'

/** `openRouteHmrPageAt` in the shared directory, closed when the test ends. */
export const openRouteHmrPage = (options: RouteHmrPageOptions) =>
  closeAtEnd(
    () => openRouteHmrPageAt({}, options),
    (app) => app.close(),
  )

/** `openWebpackHmrPageAt` in the shared directory, closed when the test ends. */
export const openWebpackHmrPage = (options: WebpackHmrPageOptions) =>
  closeAtEnd(
    () => openWebpackHmrPageAt({}, options),
    (app) => app.close(),
  )
