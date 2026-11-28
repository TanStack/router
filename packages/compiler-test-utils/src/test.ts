/**
 * The compiler tests' `test`: Vitest's own, with the fixtures every package
 * shares (each package extends it once, in its `tests/test.ts`, with its own
 * openers). A test names what it uses, and what a fixture opened closes when
 * the test ends, also when it fails or times out:
 *
 * - `browser` (worker): Chromium, launched on a worker's first use;
 * - `workerRoot` (worker), `fileRoot` (file), `appRoot` (test): directories
 *   nested in the run's directory (`./run-directory`), each removed when its
 *   worker, file or test ended;
 * - `context`, `page` (test): a browser context of the test's own and a page
 *   in it, closed first when the test ends; `pageErrors`: the page's uncaught
 *   errors and `console.error` messages, from before its first navigation;
 * - `build`, `devServer`, `rsbuildServer`, `pluginHost`, `rsbuildPluginHost`
 *   (test): the openers of this package, called with their options; each app
 *   is created in `appRoot` (standing in for an app next to the test file,
 *   unless `dir` says otherwise), and what each opened is closed when the
 *   test ends, the last opened first, then `appRoot` goes.
 *
 * Every opener registers its close before it waits for its start, and
 * checks the test's signal before it starts and after it (the harness checks
 * it between the steps of a start, `signal` of `./build-harness`): a test
 * that timed out opens nothing more, and its starts end at their next step.
 * The work a step runs (a plugin hook, a build) is not cancelled: it ends
 * on its own, and the test's close waits for it.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { test as base } from 'vitest'
import { runDirectory } from './run-directory'
import type { ConsoleMessage } from '@playwright/test'
import type { BundleOptions, BundlerPlugins } from './build-harness'
import type { DevServerOptions } from './dev-server'
import type { PluginHostOptions } from './plugin-host'
import type { RsbuildDevServerOptions } from './rsbuild-dev-server'
import type { RsbuildPluginHostOptions } from './rsbuild-plugin-host'

/** The page of the `page` fixture (for helpers that take it). */
export type { Page } from '@playwright/test'

/** An opener's options: the harness's, without what the fixture gives. */
type OpenOptions<T> = Omit<
  T,
  'dir' | 'parent' | 'signal' | 'registerCleanup'
> & {
  /** The directory the app stands in for (default: the test file's). */
  dir?: string
}

/**
 * Whether a console error is the 404 of the browser's own `/favicon.ico`
 * request, which no test app serves (full Chromium requests it, e.g.
 * Alpine's; Playwright's headless shell does not): not the page's error.
 */
function faviconMiss(message: ConsoleMessage) {
  try {
    return new URL(message.location().url).pathname === '/favicon.ico'
  } catch {
    return false
  }
}

export const test = base
  // (Vitest reads what a fixture uses from its first parameter's pattern)
  // eslint-disable-next-line no-empty-pattern
  .extend('browser', { scope: 'worker' }, async ({}, { onCleanup }) => {
    // (the CI job of a platform Playwright ships no Chromium for names the
    // distribution's)
    const executablePath = process.env.TANSTACK_COMPILER_TESTS_CHROMIUM
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({
      headless: true,
      ...(executablePath && { executablePath }),
    })
    onCleanup(() => browser.close())
    return browser
  })
  // eslint-disable-next-line no-empty-pattern
  .extend('workerRoot', { scope: 'worker' }, async ({}, { onCleanup }) => {
    const root = await mkdtemp(path.join(runDirectory(), 'worker-'))
    onCleanup(() => rm(root, { recursive: true, force: true }))
    return root
  })
  .extend(
    'fileRoot',
    { scope: 'file' },
    async ({ workerRoot }, { onCleanup }) => {
      const root = await mkdtemp(path.join(workerRoot, 'file-'))
      onCleanup(() => rm(root, { recursive: true, force: true }))
      return root
    },
  )
  .extend('appRoot', ({ fileRoot, onTestFinished }) => {
    const root = mkdtemp(path.join(fileRoot, 'test-'))
    // (registered first: runs after the closes of what the test opened)
    onTestFinished(() =>
      root.then(
        (dir) => rm(dir, { recursive: true, force: true }),
        () => {},
      ),
    )
    return root
  })
  .extend('context', async ({ browser, signal }, { onCleanup }) => {
    signal.throwIfAborted()
    const context = await browser.newContext()
    if (signal.aborted) {
      await context.close()
      signal.throwIfAborted()
    }
    onCleanup(() => context.close())
    return context
  })
  .extend('page', async ({ context, signal }) => {
    signal.throwIfAborted()
    const page = await context.newPage()
    signal.throwIfAborted()
    return page
  })
  .extend('pageErrors', ({ page }) => {
    const errors: Array<string> = []
    page.on('pageerror', (error) => {
      errors.push(error.stack ?? error.message)
    })
    page.on('console', (message) => {
      if (message.type() === 'error' && !faviconMiss(message)) {
        errors.push(message.text())
      }
    })
    return errors
  })
  .extend(
    'build',
    ({ appRoot, task, signal, onTestFinished }) =>
      async (
        options: OpenOptions<BundleOptions> & { plugins?: BundlerPlugins },
      ) => {
        signal.throwIfAborted()
        const { bundleApp } = await import('./build-harness')
        const building = bundleApp({
          dir: path.dirname(task.file.filepath),
          ...options,
          parent: appRoot,
          signal,
        })
        // (the directory outlives a build still writing)
        onTestFinished(() =>
          building.then(
            () => {},
            () => {},
          ),
        )
        const built = await building
        signal.throwIfAborted()
        return built
      },
  )
  .extend(
    'devServer',
    ({ appRoot, task, signal, onTestFinished }) =>
      async (options: OpenOptions<DevServerOptions>) => {
        signal.throwIfAborted()
        const { createDevServer } = await import('./dev-server')
        const starting = createDevServer({
          dir: path.dirname(task.file.filepath),
          ...options,
          parent: appRoot,
          signal,
        })
        onTestFinished(() =>
          starting.then(
            (server) => server.close(),
            () => {},
          ),
        )
        const server = await starting
        signal.throwIfAborted()
        return server
      },
  )
  .extend(
    'rsbuildServer',
    ({ appRoot, task, signal, onTestFinished }) =>
      async (options: OpenOptions<RsbuildDevServerOptions>) => {
        signal.throwIfAborted()
        const { createRsbuildDevServer } = await import('./rsbuild-dev-server')
        const starting = createRsbuildDevServer({
          dir: path.dirname(task.file.filepath),
          ...options,
          parent: appRoot,
          signal,
        })
        onTestFinished(() =>
          starting.then(
            (server) => server.close(),
            () => {},
          ),
        )
        const server = await starting
        signal.throwIfAborted()
        return server
      },
  )
  .extend(
    'pluginHost',
    ({ appRoot, task, signal, onTestFinished }) =>
      async (options: OpenOptions<PluginHostOptions>) => {
        signal.throwIfAborted()
        const { createPluginHost } = await import('./plugin-host')
        const starting = createPluginHost({
          dir: path.dirname(task.file.filepath),
          ...options,
          parent: appRoot,
          signal,
        })
        onTestFinished(() =>
          starting.then(
            (host) => host.close(),
            () => {},
          ),
        )
        const host = await starting
        signal.throwIfAborted()
        return host
      },
  )
  .extend(
    'rsbuildPluginHost',
    ({ appRoot, task, signal, onTestFinished }) =>
      async (options: OpenOptions<RsbuildPluginHostOptions>) => {
        signal.throwIfAborted()
        const { createRsbuildPluginHost } =
          await import('./rsbuild-plugin-host')
        const starting = createRsbuildPluginHost({
          dir: path.dirname(task.file.filepath),
          ...options,
          parent: appRoot,
          signal,
        })
        onTestFinished(() =>
          starting.then(
            (host) => host.close(),
            () => {},
          ),
        )
        const host = await starting
        signal.throwIfAborted()
        return host
      },
  )
