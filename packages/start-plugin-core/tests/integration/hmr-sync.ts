/**
 * When a page of a Vite dev server has taken in everything the server sent
 * it, and whether that made it reload, judged by the page itself rather than
 * by a quiet period or by counting HMR messages.
 *
 * The app's client code includes `hmrSyncModule` (Vite's public client HMR
 * API, `import.meta.hot.on`): it records Vite's `vite:beforeFullReload`
 * event, which Vite's client fires before it reloads the page, and the
 * token of the last `harness:sync` custom event it received. `settlePage`
 * sends that event over the dev server's HMR channel (`hot.send`) until the
 * page holds its token: one WebSocket delivers in order, so by then the
 * page has received every update and full reload the server sent before it.
 * A page that announced a full reload is waited for until its new document
 * holds the token; a page with requests in flight (an update's modules, a
 * reload's document) is not settled yet. One overall bound.
 */
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

/**
 * `src/hmr-sync.ts`: imported by a module the app's client code loads (on
 * the server too, where it does nothing: Vite's module runner has a hot
 * context but no page).
 */
export const hmrSyncModule = `if (import.meta.hot && typeof window !== 'undefined') {
  import.meta.hot.on('vite:beforeFullReload', () => {
    ;(window as any).__harnessFullReload = true
  })
  import.meta.hot.on('harness:sync', (data: { token: string }) => {
    ;(window as any).__harnessSynced = data.token
  })
}
`

/** The page's requests in flight, from now on. */
export function trackRequests(browser: BrowserPage) {
  const inFlight = new Set<unknown>()
  browser.page.on('request', (request) => inFlight.add(request))
  browser.page.on('requestfinished', (request) => inFlight.delete(request))
  browser.page.on('requestfailed', (request) => inFlight.delete(request))
  // A new document (a reload) ends the old one's requests
  browser.page.on('framenavigated', (frame) => {
    if (frame === browser.page.mainFrame()) {
      inFlight.clear()
    }
  })
  return () => inFlight.size
}

let tokens = 0

/**
 * Waits until the page took in everything `server` sent it so far (see the
 * module comment) and has nothing in flight; call it once the server
 * handled the edit (`edit()`/`settle()`). A full reload it announced has
 * happened by then (`browser.loads()` counts it).
 */
export async function settlePage(
  server: DevServer,
  browser: BrowserPage,
  inFlight: () => number,
  timeout = 10_000,
): Promise<void> {
  const token = `sync-${++tokens}`
  const state = () =>
    browser.page
      .evaluate(
        () =>
          [
            (window as any).__harnessSynced,
            (window as any).__harnessFullReload === true,
            document.readyState,
          ] as const,
      )
      // The page is between two documents
      .catch(() => [undefined, true, 'loading'] as const)
  await waitForOutcome({
    timeout,
    applied: async () => {
      const [synced, reloading, readyState] = await state()
      if (synced !== token) {
        // (again: a page that reloaded meanwhile missed it)
        server.vite.environments.client.hot.send({
          type: 'custom',
          event: 'harness:sync',
          data: { token },
        })
      }
      return synced === token && !reloading && readyState === 'complete'
    },
    quiet: async () => {
      await server.idle()
      return inFlight() === 0
    },
    describe: async () =>
      `the page did not take in the server's HMR messages: ${JSON.stringify(await state())}`,
  })
}
