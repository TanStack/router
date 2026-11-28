/**
 * The `test` of this package's integration tests: the shared fixtures
 * (`@tanstack/compiler-test-utils/test`) and the openers of `rsc-app.ts`
 * bound to the test: each makes its app in the test's `appRoot` and is
 * closed when the test ends, the last opened first. `openRscPage` opens a
 * path of a server in the test's `page`.
 */
import { test as base } from '@tanstack/compiler-test-utils/test'
import * as rsc from './rsc-app'

/**
 * An opener of `rsc-app.ts` bound to the test: it checks the test's signal
 * before and after the start, and registers the close before it waits.
 */
const bound =
  <TOptions, TOpened>(
    open: (parent: string, options: TOptions) => Promise<TOpened>,
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
    provide: (
      opener: (options: Omit<TOptions, 'signal'>) => Promise<TOpened>,
    ) => Promise<void>,
  ) =>
    provide(async (options) => {
      signal.throwIfAborted()
      const opening = open(appRoot, { ...options, signal } as TOptions)
      onTestFinished(() =>
        opening.then(
          async (opened) => {
            await (opened as { close?: () => Promise<void> }).close?.()
          },
          () => {},
        ),
      )
      const opened = await opening
      signal.throwIfAborted()
      return opened
    })

type Opener<TOpen> = TOpen extends (
  parent: string,
  options: infer TOptions,
) => infer TOpened
  ? (options: Omit<TOptions, 'signal'>) => TOpened
  : never

/** This package's fixtures, for the helpers that take them. */
export interface RscFixtures {
  startRscDevServer: Opener<typeof rsc.startRscDevServer>
  startRscRsbuildDevServer: Opener<typeof rsc.startRscRsbuildDevServer>
  startRscPreviewServer: Opener<typeof rsc.startRscPreviewServer>
  startRscRsbuildPreviewServer: Opener<typeof rsc.startRscRsbuildPreviewServer>
  failedRscBuild: Opener<typeof rsc.failedRscBuild>
  serveRscBuild: Opener<typeof rsc.serveRscBuild>
  openRscPage: (
    server: { url?: string },
    pathname: string,
  ) => ReturnType<typeof rsc.openRscPage>
}

// (one object-form `extend`: TypeScript before 5.9 loses the context's
// types along a longer chain of `extend` calls)
export const test = base.extend<RscFixtures>({
  startRscDevServer: bound(rsc.startRscDevServer),
  startRscRsbuildDevServer: bound(rsc.startRscRsbuildDevServer),
  startRscPreviewServer: bound(rsc.startRscPreviewServer),
  startRscRsbuildPreviewServer: bound(rsc.startRscRsbuildPreviewServer),
  failedRscBuild: bound(rsc.failedRscBuild),
  serveRscBuild: bound(rsc.serveRscBuild),
  openRscPage: ({ page }, provide) =>
    provide((server, pathname) => rsc.openRscPage(page, server, pathname)),
})
