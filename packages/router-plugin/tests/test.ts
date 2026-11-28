/**
 * The `test` of `integration-concurrent`: the shared fixtures and the page
 * openers bound to the test (its `appRoot` and signal; the close registered
 * before the start is awaited). Serial files open through `./serial`.
 */
import { test as base } from '@tanstack/compiler-test-utils/test'
import type { TestAPI, TestContext } from 'vitest'
import type { RouteHmrPage, RouteHmrPageOptions } from './route-hmr-page'
import type { WebpackHmrPage, WebpackHmrPageOptions } from './webpack-hmr-page'

/** Where an opener opens: the directory it writes under, the test's signal. */
export interface At {
  parent?: string
  signal?: AbortSignal
}

export const test = base.extend<{
  openRouteHmrPage: (options: RouteHmrPageOptions) => Promise<RouteHmrPage>
  openWebpackHmrPage: (
    options: WebpackHmrPageOptions,
  ) => Promise<WebpackHmrPage>
}>({
  openRouteHmrPage: ({ appRoot, signal, onTestFinished }, provide) =>
    provide(async (options) => {
      const { openRouteHmrPageAt } = await import('./route-hmr-page')
      signal.throwIfAborted()
      const opening = openRouteHmrPageAt({ parent: appRoot, signal }, options)
      onTestFinished(() =>
        opening.then(
          (app) => app.close(),
          () => {},
        ),
      )
      return opening
    }),
  openWebpackHmrPage: ({ appRoot, signal, onTestFinished }, provide) =>
    provide(async (options) => {
      const { openWebpackHmrPageAt } = await import('./webpack-hmr-page')
      signal.throwIfAborted()
      const opening = openWebpackHmrPageAt({ parent: appRoot, signal }, options)
      onTestFinished(() =>
        opening.then(
          (app) => app.close(),
          () => {},
        ),
      )
      return opening
    }),
})

/** A test's context, for the helpers that take some of it. */
export type RouterFixtures = TestContext &
  (typeof test extends TestAPI<infer TFixtures> ? TFixtures : never)

export { test as it }
