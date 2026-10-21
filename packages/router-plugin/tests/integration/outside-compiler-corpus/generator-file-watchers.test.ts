/**
 * Host-resource control, outside the compiler corpus (SPEC §8; SYNTHESIS
 * mixed rows R/generator-dev-scenarios.ts:562 and
 * R/integration/generator-watch-mode.test.ts:61): closing a dev server or a
 * watch session releases every Node file watcher handle (`FSEventWrap`,
 * `StatWatcher`) it opened, the generator's own included. Which handles a
 * watcher uses is the host's and the generator's implementation choice, so
 * this inventory must not decide acceptance of a rewrite. The corpus decides
 * the outcome (a closed dev server or watch session leaves a route file
 * created afterwards as it is) in generator-dev-scenarios.ts
 * (`expectGeneratorStopsWithServer`, run by dev-server-generator-watching
 * and rsbuild-dev-server-generator-watching) and generator-watch-mode.test.ts.
 */
import { test } from 'vitest'
import { expectGeneratorWatchersClosed } from '../../generator-dev-scenarios'
import { expectWatchSessionWatchersClosed } from '../../generator-watch-session'

test.each(['vite', 'rsbuild'] as const)(
  '%s: closing the dev server closes its file watchers, the generator’s included',
  async (bundler) => {
    await expectGeneratorWatchersClosed(bundler)
  },
  30_000,
)

test.each(['webpack', 'rspack'] as const)(
  '%s: closing the watch session closes its file watchers, the generator’s included',
  async (bundler) => {
    await expectWatchSessionWatchersClosed(bundler)
  },
  60_000,
)
