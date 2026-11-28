/**
 * Serial files' openers (TEST-TOOLS-DESIGN.md, Decision B): the close
 * registers with Vitest's global `onTestFinished` before the start begins;
 * outside a test, it throws before anything starts. `integration-concurrent`
 * opens through `./test` (eslint.config.js).
 */
import { onTestFinished } from 'vitest'
import type { RouteHmrPageOptions } from './route-hmr-page'
import type { WebpackHmrPageOptions } from './webpack-hmr-page'

export function closeAtEnd<T>(
  start: () => Promise<T>,
  close: (opened: T) => unknown,
): Promise<T> {
  const opened: { starting?: Promise<T> } = {}
  onTestFinished(async () => {
    await opened.starting?.then(close, () => {})
  })
  opened.starting = start()
  return opened.starting
}

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
