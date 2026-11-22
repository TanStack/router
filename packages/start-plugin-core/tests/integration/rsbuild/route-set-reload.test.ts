/**
 * Start's Rsbuild dev server reloads the open tab when the client's route
 * tree changes, as Start on Vite does (SPEC J3.10): a route added, a server
 * handler turned into a page and a page turned into a handler reach the tab
 * through one page load, whose document is the one the server builds from
 * the edit; an edit that leaves the route set as it was reloads nothing.
 * (`route-set-reload-app.ts`)
 * Source: design-routeset-v5.1.md §6 step 2, tests 1 to 4 (the route-set
 * gate's `add`, `server-to-page` and `page-to-server` rows on
 * `start-rsbuild dev`: the tab stayed on the route set it hydrated with).
 */
import { expect, test } from 'vitest'
import {
  documentAfter,
  handlerRoute,
  openTab,
  pageRoute,
  startReloadServer,
} from './route-set-reload-app'

const timeout = 60_000

test(
  'a route added: the tab reloads once and reaches the route with its own router',
  async () => {
    const reload = await startReloadServer()
    const tab = await openTab(reload, '/')
    await reload.server.edit({
      'src/routes/new.tsx': pageRoute('/new', 'MARK_NEW'),
    })
    await tab.loaded(2)
    await tab.visit('to-new', 'MARK_NEW')
    await reload.server.settle()
    await tab.settled()
    expect(tab.loads()).toBe(2)
    expect(tab.browser.errors).toEqual([])
  },
  timeout,
)

test(
  'a server handler turned into a page: the tab reloads and shows the page',
  async () => {
    const reload = await startReloadServer({
      files: { 'src/routes/about.tsx': handlerRoute('/about', 'HANDLER') },
    })
    const tab = await openTab(reload, '/')
    await reload.server.edit({
      'src/routes/about.tsx': pageRoute('/about', 'MARK_ABOUT_PAGE'),
    })
    await tab.loaded(2)
    await tab.visit('to-about', 'MARK_ABOUT_PAGE')
    expect(tab.browser.errors).toEqual([])
  },
  timeout,
)

test(
  "a page turned into a handler: the tab's reload gets the handler's response",
  async () => {
    const reload = await startReloadServer()
    const tab = await openTab(reload, '/about')
    await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
    await reload.server.edit({
      'src/routes/about.tsx': handlerRoute('/about', 'HANDLER_NEW'),
    })
    await tab.loaded(2, { app: false })
    expect(await documentAfter(tab, 1)).toBe('HANDLER_NEW')
  },
  timeout,
)

test(
  'an edit of a component reloads nothing',
  async () => {
    const reload = await startReloadServer()
    const tab = await openTab(reload, '/')
    await reload.server.edit({
      'src/routes/index.tsx': pageRoute('/', 'MARK_INDEX_EDITED'),
    })
    await tab.browser.waitForText('MARK_INDEX_EDITED', { selector: '#app' })
    await reload.server.settle()
    await tab.settled()
    expect(tab.loads()).toBe(1)
  },
  timeout,
)
