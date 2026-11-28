/**
 * The `test` of the files that run their tests at once
 * (`integration-concurrent`): the shared fixtures
 * (`@tanstack/compiler-test-utils/test`) and the page openers bound to the
 * test, so that each test closes its own. Each opens in the test's
 * `appRoot`, checks the test's signal before and after its start, and
 * registers its close before it waits. Serial files call the openers
 * themselves (they close when the test ends).
 */
import { test as base } from '@tanstack/compiler-test-utils/test'
import type { TestAPI, TestContext } from 'vitest'
import type * as hmrPage from './route-hmr-page'
import type * as webpackPage from './webpack-hmr-page'

/** Where an opener opens: the directory it writes under, the test's signal. */
export interface At {
  parent?: string
  signal?: AbortSignal
}

const bound =
  <TOptions, TOpened extends { close: () => Promise<void> }>(
    load: () => Promise<(at: At, options: TOptions) => Promise<TOpened>>,
  ) =>
  (
    {
      appRoot,
      signal,
      onTestFinished,
    }: {
      appRoot: string
      signal: AbortSignal
      onTestFinished: (close: () => Promise<void>) => void
    },
    provide: (opener: (options: TOptions) => Promise<TOpened>) => Promise<void>,
  ) =>
    provide(async (options) => {
      const open = await load()
      signal.throwIfAborted()
      const opening = open({ parent: appRoot, signal }, options)
      onTestFinished(() =>
        opening.then(
          (opened) => opened.close(),
          () => {},
        ),
      )
      const opened = await opening
      signal.throwIfAborted()
      return opened
    })

type Opener<TOpen> = TOpen extends (
  at: At,
  options: infer TOptions,
) => infer TOpened
  ? (options: TOptions) => TOpened
  : never

export const test = base.extend<{
  openRouteHmrPage: Opener<typeof hmrPage.openRouteHmrPageAt>
  openWebpackHmrPage: Opener<typeof webpackPage.openWebpackHmrPageAt>
}>({
  openRouteHmrPage: bound(
    async () => (await import('./route-hmr-page')).openRouteHmrPageAt,
  ),
  openWebpackHmrPage: bound(
    async () => (await import('./webpack-hmr-page')).openWebpackHmrPageAt,
  ),
})

/** A test's context, for the helpers that take some of it. */
export type RouterFixtures = TestContext &
  (typeof test extends TestAPI<infer TFixtures> ? TFixtures : never)

export { test as it }
