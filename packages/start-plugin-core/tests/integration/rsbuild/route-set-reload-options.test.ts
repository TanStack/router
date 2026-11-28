/**
 * The route-set reload of Start's Rsbuild dev server follows the app's own
 * `dev` options, as Rsbuild's own reloads do: none with `dev.liveReload:
 * false` (the tab keeps its document and route set), and with HMR off and
 * live reload on, Rsbuild's one reload at the client's compile. (`route-set-reload-app.ts`)
 * Source: design-routeset-v5.1.md §6 step 2, test 4.
 */
import { expect, test } from 'vitest'
import { openTab, pageRoute, startReloadServer } from './route-set-reload-app'

test('with dev.liveReload false, a route added reloads nothing', async () => {
  const reload = await startReloadServer({
    config: { dev: { liveReload: false } },
  })
  const tab = await openTab(reload, '/')
  await reload.server.edit({
    'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
  })
  await reload.server.settle()
  await tab.settled()
  expect(tab.loads()).toBe(1)
})

// Rsbuild's client reloads the tab at every client compile then: Start
// sends no reload of its own on top of it.
// Source: design-routeset-v5.2.md §1.2 (v5.1 sent one).
test('with dev.hmr false and live reload on, a route added reloads the tab once, by Rsbuild alone', async () => {
  const reload = await startReloadServer({
    hmr: false,
    config: { dev: { hmr: false, liveReload: true } },
  })
  const tab = await openTab(reload, '/')
  await reload.server.edit({
    'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
  })
  await tab.loaded(2)
  await tab.visit('to-new', 'MARK_NEW')
  await reload.server.settle()
  expect(tab.loads()).toBe(2)
  expect(tab.documents).toHaveLength(2)
  expect(reload.sent.filter((type) => type === 'full-reload')).toEqual([])
})
