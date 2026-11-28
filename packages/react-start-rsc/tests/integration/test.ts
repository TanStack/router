/**
 * The `test` of this package's concurrent files (`../concurrent-tests.json`):
 * the shared fixtures (`@tanstack/compiler-test-utils/test`), and
 * `openRscPage`, which opens a path of a server in the test's `page`. Serial
 * files use Vitest's `test` and the openers of `rsc-app.ts`.
 */
import { test as base } from '@tanstack/compiler-test-utils/test'
import { visit } from './rsc-app'

export const test = base.extend(
  'openRscPage',
  ({ page }) =>
    (server: { url?: string }, pathname: string) =>
      visit(page, server, pathname),
)
