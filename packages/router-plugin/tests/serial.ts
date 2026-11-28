/**
 * Serial files' openers (TEST-TOOLS-DESIGN.md, Decision B), closed with the
 * current test (`closeAtEnd`). `integration-concurrent` opens through
 * `./test` (eslint.config.js).
 */
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import type { RouteHmrPageOptions } from './route-hmr-page'
import type { WebpackHmrPageOptions } from './webpack-hmr-page'

/** `openRouteHmrPageAt` in the shared directory, closed when the test ends. */
export const openRouteHmrPage = (options: RouteHmrPageOptions) =>
  closeAtEnd(
    async () =>
      (await import('./route-hmr-page')).openRouteHmrPageAt({}, options),
    (app) => app.close(),
  )

/** `openWebpackHmrPageAt` in the shared directory, closed when the test ends. */
export const openWebpackHmrPage = (options: WebpackHmrPageOptions) =>
  closeAtEnd(
    async () =>
      (await import('./webpack-hmr-page')).openWebpackHmrPageAt({}, options),
    (app) => app.close(),
  )
