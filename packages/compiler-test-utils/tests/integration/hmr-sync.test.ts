/**
 * Control tests of `settlePage` (hmr-sync.ts) on the Vite dev-server harness
 * in `browser` mode: once it resolves, the page has handled every message
 * the server sent before it. An update a module accepts has been applied
 * (the page shows it at once, without waiting), and an update nothing
 * accepts has reloaded the page (its load count tells), whether the page's
 * code imports the sync module or the page imports it on every load
 * (`hmrSyncInitScript`); and an update whose accept callback invalidates it
 * (as a refresh runtime does when it cannot apply one) has had the reload
 * that the page's `invalidate()` asked the server for, also when what the
 * page sends reaches the server late.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { openPage } from '../../src/browser'
import { createDevServer } from '../../src/dev-server'
import {
  hmrSyncInitScript,
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '../../src/hmr-sync'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * An entry that shows the texts of `text.js` and `other.js` and applies
 * updates of `text.js` itself; nothing accepts the updates of `other.js`.
 * With `sync`, it imports the sync module itself.
 */
const app = (sync: boolean) => ({
  'index.html': `<div id="app"></div><script type="module" src="/main.js"></script>`,
  'hmr-sync.ts': hmrSyncModule,
  'main.js': `${sync ? `import './hmr-sync.ts'\n` : ''}import { text } from './text.js'
import { other } from './other.js'
const show = (value) => {
  document.getElementById('app').textContent = value + ' ' + other
}
show(text)
import.meta.hot.accept('./text.js', (updated) => show(updated.text))
`,
  'text.js': `export const text = 'text v1'\n`,
  'other.js': `export const other = 'other v1'\n`,
})

test.for([
  { name: 'the app imports the sync module', sync: true },
  { name: 'the page imports it on every load', sync: false },
])(
  'once settled, an accepted update shows in place and one nothing accepts has reloaded the page ($name)',
  { timeout },
  async ({ sync }) => {
    const server = await createDevServer({
      dir: testsDir,
      prefix: '.hmr-sync-',
      registerCleanup: onTestFinished,
      browser: true,
      files: app(sync),
      // The edited modules come late (a slow transform): the page handles
      // the update, or loads again, a while after the server sent it
      plugins: [
        {
          name: 'slow-edited-modules',
          async transform(code, id) {
            if (/(text|other)\.js$/.test(id) && code.includes('v2')) {
              await new Promise((resolve) => setTimeout(resolve, 500))
            }
            return null
          },
        },
      ],
    })
    const page = await openPage(server.url!, {
      registerCleanup: onTestFinished,
      ...(sync ? {} : { initScript: hmrSyncInitScript('/hmr-sync.ts') }),
    })
    const inFlight = trackRequests(page)
    await page.waitForText('text v1 other v1')
    await settlePage(server, page, inFlight)

    await server.edit({ 'text.js': `export const text = 'text v2'\n` })
    await settlePage(server, page, inFlight)
    expect({ text: await page.text('#app'), loads: page.loads() }).toEqual({
      text: 'text v2 other v1',
      loads: 1,
    })

    await server.edit({ 'other.js': `export const other = 'other v2'\n` })
    await settlePage(server, page, inFlight)
    expect({ text: await page.text('#app'), loads: page.loads() }).toEqual({
      text: 'text v2 other v2',
      loads: 2,
    })
  },
)

test(
  'once settled, an update whose accept callback invalidates it has reloaded the page, also when the page reaches the server late',
  { timeout },
  async () => {
    const server = await createDevServer({
      dir: testsDir,
      prefix: '.hmr-sync-',
      registerCleanup: onTestFinished,
      browser: true,
      files: {
        'index.html': `<div id="app"></div><script type="module" src="/main.js"></script>`,
        'hmr-sync.ts': hmrSyncModule,
        // A module that accepts its own update, then gives up on it (Vite
        // propagates the update to its importer, which accepts nothing: a
        // full reload)
        'main.js': `import './hmr-sync.ts'
import { text } from './text.js'
document.getElementById('app').textContent = text
`,
        'text.js': `export const text = 'text v1'
import.meta.hot.accept(() => import.meta.hot.invalidate('cannot apply'))
`,
      },
    })
    const page = await openPage('about:blank', {
      registerCleanup: onTestFinished,
    })
    // What the page sends over its HMR WebSocket reaches the server 400 ms
    // late (a busy server or a slow link); what the server sends is not held
    await page.page.context().routeWebSocket(/./, (ws) => {
      const upstream = ws.connectToServer()
      ws.onMessage((message) => {
        setTimeout(() => upstream.send(message), 400)
      })
      upstream.onMessage((message) => ws.send(message))
    })
    await page.page.goto(server.url!)
    const inFlight = trackRequests(page)
    await page.waitForText('text v1')
    await settlePage(server, page, inFlight)
    const loads = page.loads()

    await server.edit({
      'text.js': `export const text = 'text v2'
import.meta.hot.accept(() => import.meta.hot.invalidate('cannot apply'))
`,
    })
    await settlePage(server, page, inFlight)
    expect({
      text: await page.text('#app'),
      reloads: page.loads() - loads,
    }).toEqual({ text: 'text v2', reloads: 1 })
  },
)
