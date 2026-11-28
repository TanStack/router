/**
 * With RSC, Start turns Rsbuild's live reload off (its client then drops a
 * reload), so the route-set reload reaches the tab over the RSC client's
 * own channel, and only when the app's own config leaves live reload on: a
 * page turned into a handler reloads the tab into the handler's response;
 * with the app's `dev.liveReload: false` the tab keeps its document.
 * (`route-set-reload-app.ts`, the RSC app of `../rsc-warning-app.ts`)
 * Source: design-routeset-v5.1.md §6 step 3 (decision R = B).
 */
import { expect, test } from 'vitest'
import { startRsbuildRscApp } from '../rsc-warning-app'
import {
  documentAfter,
  handlerRoute,
  installedReact,
  openTab,
  reloadApp,
} from './route-set-reload-app'
import type { RsbuildConfig } from '@rsbuild/core'

/** The reload app as an RSC app: its router module is `src/router.tsx`. */
async function startRscReloadServer(
  config: Pick<RsbuildConfig, 'dev' | 'environments'> = {},
) {
  const { 'src/router.ts': router, ...files } = reloadApp
  const server = await startRsbuildRscApp(
    { ...files, 'src/router.tsx': router! },
    // (React Refresh as in an installed app)
    {
      dev: { ...config.dev, client: { logLevel: 'error' } },
      environments: config.environments,
      react: installedReact(),
    },
  )
  return { server, url: server.url!, clientHash: () => undefined, sent: [] }
}

test("RSC: a page turned into a handler reloads the tab into the handler's response", async () => {
  const reload = await startRscReloadServer()
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
})

test.each([
  { where: 'dev.liveReload', config: { dev: { liveReload: false } } },
  {
    where: 'client environment dev.liveReload',
    config: { environments: { client: { dev: { liveReload: false } } } },
  },
] as const)(
  "RSC with the app's $where false: a page turned into a handler keeps the tab's document",
  async ({ config }) => {
    const reload = await startRscReloadServer(config)
    const tab = await openTab(reload, '/about')
    await tab.browser.waitForText('MARK_ABOUT', { selector: '#app' })
    await tab.browser.page.evaluate(() => {
      ;(window as any).__kept = true
    })
    await reload.server.edit({
      'src/routes/about.tsx': handlerRoute('/about', 'HANDLER_NEW'),
    })
    await reload.server.settle()
    expect(tab.loads()).toBe(1)
    expect(await tab.browser.page.evaluate(() => (window as any).__kept)).toBe(
      true,
    )
  },
)
