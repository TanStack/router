/**
 * Start's Rsbuild dev server reloads the open tab when the client's route
 * tree changes, as Start on Vite does (SPEC J3.10): a route added, a server
 * handler turned into a page and a page turned into a handler reach the tab
 * through one page load, whose document is the one the server builds from
 * the edit, and no hot update the tab's dev client fell back to a reload
 * for; an edit that leaves the route set as it was reloads nothing. In an
 * installed app (React Refresh leaves Start's client out) and in a monorepo
 * that links Start (React Refresh instruments it). (`route-set-reload-app.ts`)
 * Source: design-routeset-v5.1.md §6 step 2, tests 1 to 4 (the route-set
 * gate's `add`, `server-to-page` and `page-to-server` rows on
 * `start-rsbuild dev`: the tab stayed on the route set it hydrated with);
 * design-routeset-v5.2.md §1 (installed: Rsbuild's own reload at the
 * client's compile came on top of Start's, with `HMR update failed` in the
 * console).
 */
import { describe, expect, test } from 'vitest'
import { reportedErrors } from '../../rsbuild-dev-server'
import {
  documentAfter,
  handlerRoute,
  openTab,
  pageRoute,
  startLayouts,
  startReloadServer,
} from './route-set-reload-app'

describe.each(startLayouts)('%s Start', (layout) => {
  test('a route added: the tab reloads once and reaches the route with its own router', async () => {
    const reload = await startReloadServer({ layout })
    const tab = await openTab(reload, '/')
    await reload.server.edit({
      'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
    })
    await tab.loaded(2)
    await tab.visit('to-new', 'MARK_NEW')
    await reload.server.settle()
    await tab.settled()
    expect(tab.loads()).toBe(2)
    expect(tab.documents).toHaveLength(2)
    expect(tab.failedUpdates()).toEqual([])
    expect(tab.browser.errors).toEqual([])
    expect(reportedErrors(reload.server)).toEqual([])
  })

  test('a server handler turned into a page: the tab reloads and shows the page', async () => {
    const reload = await startReloadServer({
      layout,
      files: { 'src/routes/about.tsx': handlerRoute('/about', 'HANDLER') },
    })
    const tab = await openTab(reload, '/')
    await reload.server.edit({
      'src/routes/about.tsx': pageRoute('/about', 'MARK_ABOUT_PAGE'),
    })
    await tab.loaded(2)
    await tab.visit('to-about', 'MARK_ABOUT_PAGE')
    expect(tab.browser.errors).toEqual([])
  })

  test("a page turned into a handler: the tab's reload gets the handler's response", async () => {
    const reload = await startReloadServer({ layout })
    const tab = await openTab(reload, '/about')
    await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
    await reload.server.edit({
      'src/routes/about.tsx': handlerRoute('/about', 'HANDLER_NEW'),
    })
    await tab.loaded(2, { app: false })
    expect(await documentAfter(tab, 1)).toBe('HANDLER_NEW')
    await reload.server.settle()
    expect(tab.documents).toHaveLength(2)
    expect(tab.failedUpdates()).toEqual([])
    expect(reportedErrors(reload.server)).toEqual([])
  })

  test('an edit of a component reloads nothing', async () => {
    const reload = await startReloadServer({ layout })
    const tab = await openTab(reload, '/')
    await reload.server.edit({
      'src/routes/index.tsx': pageRoute('/', 'MARK_INDEX_EDITED'),
    })
    await tab.browser.waitForText('MARK_INDEX_EDITED', { selector: '#app' })
    await reload.server.settle()
    await tab.settled()
    expect(tab.loads()).toBe(1)
  })
})
