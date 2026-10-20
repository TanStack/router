/**
 * Control tests of the real browser page (browser.ts) on the dev-server
 * harnesses in `browser` mode (dev-server.ts, rsbuild-dev-server.ts): the
 * page runs the dev server's own HMR client, the dev server's own file
 * watcher reports an edit, an update a module accepts applies in place, and
 * an update nothing accepts reloads the page. A page can be given its
 * document, and an init script runs before the page's own code.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { openPage } from '../../src/browser'
import { createDevServer } from '../../src/dev-server'
import { createRsbuildDevServer } from '../../src/rsbuild-dev-server'

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
