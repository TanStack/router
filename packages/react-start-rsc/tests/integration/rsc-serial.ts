/**
 * The openers of serial tests (TEST-TOOLS-DESIGN.md, Decision B), closed
 * with the current test (`closeAtEnd`; a start that failed has nothing left
 * to close: the openers remove their app then). Concurrent files and the
 * helper modules never import this module (ESLint, `eslint.config.js`). KNOWN-BUGS, "Accepted limits": what a test
 * that timed out still opens is closed with the next test.
 */
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import {
  openRscBuild,
  openRscDevServer,
  openRscPreviewServer,
  openRscRsbuildDevServer,
  openRscRsbuildPreviewServer,
  visit,
} from './rsc-app'
import type { Page } from '@tanstack/compiler-test-utils/test'

/** `open` (in the run's directory), closed when the current test finishes. */
const closedAfterTest =
  <TOptions, TOpened extends { close: () => Promise<void> }>(
    open: (options: TOptions) => Promise<TOpened>,
  ) =>
  (options: TOptions): Promise<TOpened> =>
    closeAtEnd(
      () => open(options),
      (opened) => opened.close(),
    )

export const startRscDevServer = closedAfterTest(openRscDevServer)
export const startRscRsbuildDevServer = closedAfterTest(openRscRsbuildDevServer)
export const startRscPreviewServer = closedAfterTest(openRscPreviewServer)
export const startRscRsbuildPreviewServer = closedAfterTest(
  openRscRsbuildPreviewServer,
)
export const serveRscBuild = closedAfterTest(openRscBuild)

/** A blank page in a browser context of its own, closed when the test finishes. */
export async function blankPage(): Promise<Page> {
  return (await closedAfterTest(() => openPage('about:blank'))(undefined)).page
}

/** Opens `pathname` of `server` in a new page (`blankPage`). */
export async function openRscPage(
  server: { url?: string },
  pathname: string,
): Promise<Page> {
  return visit(await blankPage(), server, pathname)
}
