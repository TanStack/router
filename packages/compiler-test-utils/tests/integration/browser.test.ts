/**
 * Control tests of the real browser page (browser.ts) on the dev-server
 * harnesses in `browser` mode (dev-server.ts, rsbuild-dev-server.ts): the
 * page runs the dev server's own HMR client, the dev server's own file
 * watcher reports an edit, an update a module accepts applies in place, and
 * an update nothing accepts reloads the page. A page can be given its
 * document, and an init script runs before the page's own code.
 */
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import {
  openPage,
  openPageLimit,
  runInPage,
  runPageLimit,
} from '../../src/browser'
import { createDevServer } from '../../src/dev-server'
import { createPluginHost } from '../../src/plugin-host'
import { createRsbuildDevServer } from '../../src/rsbuild-dev-server'
import type { AddressInfo } from 'node:net'
import type { Rspack } from '@rsbuild/core'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * An entry that shows the texts of `text.js` and `other.js`, and applies
 * updates of `text.js` itself with the bundler's hot API (`hot`); nothing
 * accepts the updates of `other.js`.
 */
const app = (hot: string) => ({
  'main.js': `import { text } from './text.js'
import { other } from './other.js'
const show = (value) => {
  document.getElementById('app').textContent = value + ' ' + other
}
show(text)
// Vite passes the new module; webpack updates the imported binding
${hot}.accept('./text.js', (updated) => show(updated?.text ?? text))
`,
  'text.js': `export const text = 'text v1'\n`,
  'other.js': `export const other = 'other v1'\n`,
})

test(
  'vite: the page shows an accepted update in place, and reloads for one nothing accepts',
  async () => {
    const server = await createDevServer({
      dir: testsDir,
      registerCleanup: onTestFinished,
      browser: true,
      files: {
        'index.html': `<div id="app"></div><script type="module" src="/main.js"></script>`,
        ...app('import.meta.hot'),
      },
    })
    const page = await openPage(server.url!, {
      registerCleanup: onTestFinished,
    })
    await page.waitForText('text v1 other v1')
    expect(page.loads()).toBe(1)

    await server.write({ 'text.js': `export const text = 'text v2'\n` })
    await page.waitForText('text v2 other v1')
    expect(page.loads()).toBe(1)

    await server.write({ 'other.js': `export const other = 'other v2'\n` })
    await page.waitForText('text v2 other v2')
    await expect.poll(() => page.loads()).toBe(2)
  },
  timeout,
)

test(
  'rsbuild: the page shows an accepted update in place, and reloads for one nothing accepts',
  async () => {
    const server = await createRsbuildDevServer({
      dir: testsDir,
      registerCleanup: onTestFinished,
      browser: true,
      entry: 'main.js',
      config: { html: { mountId: 'app' } },
      files: app('import.meta.webpackHot'),
    })
    const page = await openPage(server.url!, {
      registerCleanup: onTestFinished,
    })
    await page.waitForText('text v1 other v1')
    expect(page.loads()).toBe(1)

    await server.edit({ 'text.js': `export const text = 'text v2'\n` })
    await page.waitForText('text v2 other v1')
    expect(page.loads()).toBe(1)

    await server.edit({ 'other.js': `export const other = 'other v2'\n` })
    await page.waitForText('text v2 other v2')
    await expect.poll(() => page.loads()).toBe(2)
  },
  timeout,
)

// The page's console has only the app's output. The harness reads Rsbuild's
// logger without raising `logLevel`, to which Rsbuild ties the HMR client's
// log level by default: at `warn`, the client prints each compile's
// warnings (and its failed connection attempts) in the page.
test(
  'rsbuild: Rsbuild’s HMR client prints nothing in the page',
  async () => {
    const server = await createRsbuildDevServer({
      dir: testsDir,
      registerCleanup: onTestFinished,
      browser: true,
      entry: 'main.js',
      config: { html: { mountId: 'app' } },
      files: app('import.meta.webpackHot'),
      plugins: [
        {
          name: 'compile-warner',
          setup(api) {
            api.modifyRspackConfig((config) => {
              config.plugins.push({
                apply(compiler: Rspack.Compiler) {
                  compiler.hooks.thisCompilation.tap(
                    'compile-warner',
                    (compilation) => {
                      compilation.warnings.push(
                        new compiler.webpack.WebpackError(
                          'MARK_COMPILE_WARNING',
                        ),
                      )
                    },
                  )
                },
              })
            })
          },
        },
      ],
    })
    const page = await openPage(server.url!, {
      registerCleanup: onTestFinished,
    })
    await page.waitForText('text v1 other v1')
    // The client applied an update in place: it was connected, and got the
    // first compile's warnings before
    await server.edit({ 'text.js': `export const text = 'text v2'\n` })
    await page.waitForText('text v2 other v1')
    expect(page.loads()).toBe(1)
    expect(page.console).toEqual([])
    expect(page.errors).toEqual([])
    // The harness's channel has the warning
    expect(
      server.diagnostics.some(({ text }) =>
        text.includes('MARK_COMPILE_WARNING'),
      ),
    ).toBe(true)
  },
  timeout,
)

test('a page given its document shows it at its URL, and an init script runs before the page’s own code, on every load', async () => {
  // No server listens there: the document is the one given.
  const url = 'http://127.0.0.1:9/page'
  const page = await openPage(url, {
    registerCleanup: onTestFinished,
    initScript: `window.initRan = (window.initRan ?? 0) + 1`,
    html: `<div id="app"></div><script>
window.appSaw = window.initRan
document.getElementById('app').textContent = 'MARK_DOCUMENT ' + location.href
</script>`,
  })
  expect(await page.text('#app')).toBe(`MARK_DOCUMENT ${url}`)
  expect(await page.page.evaluate('window.appSaw')).toBe(1)
  await page.page.reload()
  expect(await page.page.evaluate('[window.appSaw, window.initRan]')).toEqual([
    1, 1,
  ])
})

// The run pages serve every run of a test process, so a
// script that never settles must fail its run within the bound and leave
// its page (or a new one) to the next run.
test('a run whose script never settles fails within its bound, and the next run gets a page', async () => {
  const started = Date.now()
  await expect(
    runInPage({
      pageUrl: 'about:blank',
      script: 'await new Promise(() => {})',
      timeout: 1000,
    }),
  ).rejects.toThrow(/did not settle within 1000 ms/)
  expect(Date.now() - started).toBeLessThan(10_000)
  expect(
    (await runInPage({ pageUrl: 'about:blank', script: 'return 1 + 1' }))
      .result,
  ).toBe(2)
})

// What a test process opens in its browser is bounded (Chromium fails
// requests under too many pages), and runs of concurrent tests do not share
// a document.
test('concurrent runs each hold a page of their own, at most runPageLimit at once, each on a fresh document', async () => {
  let active = 0
  let most = 0
  const server = createServer((request, response) => {
    if (request.url === '/page') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><p>page</p>')
      return
    }
    active++
    most = Math.max(most, active)
    setTimeout(() => {
      active--
      response.end('held')
    }, 300)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  onTestFinished(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  )
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  const runs = await Promise.all(
    Array.from({ length: runPageLimit + 2 }, (_, index) =>
      runInPage<{ earlier: unknown; held: string }>({
        pageUrl: `${url}page`,
        script: `const earlier = window.__earlierRun ?? null
window.__earlierRun = ${index}
// (a URL of its own: the browser's HTTP cache makes requests of the same
// URL wait for each other)
return { earlier, held: await (await fetch('/hold?run=${index}')).text() }`,
      }),
    ),
  )
  expect(runs.map((run) => run.result)).toEqual(
    runs.map(() => ({ earlier: null, held: 'held' })),
  )
  expect(most).toBeGreaterThan(1)
  expect(most).toBeLessThanOrEqual(runPageLimit)
})

// A run returns once its page left the run's document, so what the dev
// server sends next (a full reload after the test's edit) reaches no page a
// later run gets. When the page left only after the run returned, such a
// reload, started while the page was on its way to `about:blank`, outlived
// that navigation and interrupted the next run's navigation (under load).
test('a run returns once its page left the run’s document: a message the dev server sends next reaches no page', async () => {
  let answers = 0
  const host = await createPluginHost({
    dir: testsDir,
    registerCleanup: onTestFinished,
    client: true,
    plugins: [
      {
        name: 'control:answers',
        configureServer(server) {
          server.middlewares.use('/__answer', (_request, response) => {
            answers++
            response.end()
          })
        },
      },
    ],
    files: {
      'main.js': `export const value = 'MARK_VALUE'
import.meta.hot.on('control:probe', () => {
  navigator.sendBeacon('/__answer')
})
`,
    },
  })
  for (let round = 0; round < 5; round++) {
    const run = await host.runClient<string>('/main.js', 'return module.value')
    expect(run.result).toBe('MARK_VALUE')
    host.dev.vite.environments.client.hot.send({
      type: 'custom',
      event: 'control:probe',
    })
    // A page still on the run's document gets the message within a moment
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(answers).toBe(0)
    // and a full reload sent then reaches no later run
    host.dev.vite.environments.client.hot.send({ type: 'full-reload' })
    const later = await host.runClient<{ value: string; loads: number }>(
      '/main.js',
      `await new Promise((resolve) => setTimeout(resolve, 200))
return { value: module.value, loads: performance.getEntriesByType('navigation').length }`,
    )
    expect(later.result).toEqual({ value: 'MARK_VALUE', loads: 1 })
  }
})

test('openPage keeps at most openPageLimit pages open: one more waits until one closes', async () => {
  const pages = await Promise.all(
    Array.from({ length: openPageLimit }, () =>
      openPage('about:blank', { registerCleanup: onTestFinished }),
    ),
  )
  let opened = false
  const next = openPage('about:blank', { registerCleanup: onTestFinished })
  void next.then(() => {
    opened = true
  })
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(opened).toBe(false)
  await pages[0]!.close()
  await next
  expect(opened).toBe(true)
})
