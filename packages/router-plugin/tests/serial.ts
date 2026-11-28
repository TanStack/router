/**
 * The page openers of the serial files (TEST-TOOLS-DESIGN.md, Decision B):
 * each registers its close with Vitest's global `onTestFinished` when it is
 * called, while the calling test runs. The files of `integration-concurrent`
 * open them through the fixtures of `./test` instead (eslint.config.js).
 */
import { onTestFinished } from 'vitest'
import { openRouteHmrPageAt } from './route-hmr-page'
import { openWebpackHmrPageAt } from './webpack-hmr-page'
import type { RouteHmrPageOptions } from './route-hmr-page'
import type { WebpackHmrPageOptions } from './webpack-hmr-page'

/** Registers the close of `opening` for the end of the running test. */
function closedAtEnd<T extends { close: () => Promise<void> }>(
  opening: Promise<T>,
) {
  onTestFinished(() =>
    opening.then(
      (opened) => opened.close(),
      () => {},
    ),
  )
  return opening
}

/** `openRouteHmrPageAt` in the shared directory, closed when the test ends. */
export const openRouteHmrPage = (options: RouteHmrPageOptions) =>
  closedAtEnd(openRouteHmrPageAt({}, options))

/** `openWebpackHmrPageAt` in the shared directory, closed when the test ends. */
export const openWebpackHmrPage = (options: WebpackHmrPageOptions) =>
  closedAtEnd(openWebpackHmrPageAt({}, options))
