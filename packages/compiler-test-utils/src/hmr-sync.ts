/**
 * When a page of a Vite dev server has taken in everything the server sent
 * it, and whether that made it reload, judged by the page itself rather than
 * by a quiet period or by counting HMR messages.
 *
 * The app's client code includes `hmrSyncModule` (Vite's public client HMR
 * API, `import.meta.hot.on`/`send`), or the page imports it on every load
 * (`hmrSyncInitScript`, `openPage`'s `initScript`): it records Vite's
 * `vite:beforeFullReload` event, which Vite's client fires before it
 * reloads the page, and the token of the last `harness:sync` custom event
 * it received, and answers each one with `harness:synced` over the same
 * WebSocket. `settlePage` sends that event over the dev server's HMR
 * channel (`hot.send`) until the page holds its token: one WebSocket
 * delivers in order, and Vite's client handles one message after the other
 * (an update once its modules are fetched and its accept callbacks ran), so
 * by then the page has received and handled every update and full reload
 * the server sent before it.
 * What the page sent back while it handled them (an accept callback's
 * `invalidate()`, e.g. a refresh runtime that cannot apply an update) reaches
 * the server before the page's answer, on the same WebSocket, and Vite
 * handles it as it arrives (the update or full reload it causes is sent
 * then): so a page counts as settled only once its answer came back with
 * nothing else sent to the client since the token went out; otherwise
 * another token follows what was sent meanwhile.
 * A page that announced a full reload is waited for until its new document
 * holds the token; a page with requests in flight (an update's modules, a
 * reload's document) is not settled yet. One overall bound.
 */
import { waitForOutcome } from './outcome'
import type { BrowserPage } from './browser'
import type { DevServer, HmrMessage } from './dev-server'

/**
 * `src/hmr-sync.ts`: imported by a module the app's client code loads (on
 * the server too, where it does nothing: Vite's module runner has a hot
 * context but no page).
 */
export const hmrSyncModule = `if (import.meta.hot && typeof window !== 'undefined') {
  const hot = import.meta.hot
  const page = ((window as any).__harnessPage ??= Math.random().toString(36).slice(2))
  hot.on('vite:beforeFullReload', () => {
    ;(window as any).__harnessFullReload = true
  })
  hot.on('harness:sync', (data: { token: string }) => {
    ;(window as any).__harnessSynced = data.token
    hot.send('harness:synced', { token: data.token, page })
  })
}
`

/**
 * `initScript` of a page (`openPage`) that imports `hmrSyncModule`, served
 * by the dev server at `url`, before the page's own code, on every load.
 */
export const hmrSyncInitScript = (url: string) =>
  `import(${JSON.stringify(url)}).catch(() => {})`

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

/** A payload of the server's own sync event (`settlePage`). */
const isSync = (message: HmrMessage) =>
  message.payload.type === 'custom' && message.payload.event === 'harness:sync'

/**
 * Waits until the page took in everything `server` sent it so far, and what
 * that made the page ask of the server (see the module comment), and has
 * nothing in flight; call it once the server handled the edit
 * (`edit()`/`settle()`). A full reload it announced has happened by then
 * (`browser.loads()` counts it).
 */
export async function settlePage(
  server: DevServer,
  browser: BrowserPage,
  inFlight: () => number,
  timeout = 10_000,
): Promise<void> {
  const hot = server.vite.environments.client.hot
  /**
   * The token out now, where the server's messages stood when it went out,
   * and per page document that answered it: whether the server sent the
   * client nothing else from then until the answer came.
   */
  let round: { token: string; from: number; answers: Map<string, boolean> }
  const nextRound = () => {
    round = {
      token: `sync-${++tokens}`,
      from: server.hmr.length,
      answers: new Map(),
    }
  }
  nextRound()
  const onSynced = (data: { token: string; page: string }) => {
    if (data.token === round.token) {
      round.answers.set(
        data.page,
        !server.hmr
          .slice(round.from)
          .some(
            (message) => message.environment === 'client' && !isSync(message),
          ),
      )
    }
  }
  hot.on('harness:synced', onSynced)
  const state = () =>
    browser.page
      .evaluate(
        () =>
          [
            (window as any).__harnessSynced,
            (window as any).__harnessPage,
            (window as any).__harnessFullReload === true,
            document.readyState,
          ] as const,
      )
      // The page is between two documents
      .catch(() => [undefined, undefined, true, 'loading'] as const)
  try {
    await waitForOutcome({
      timeout,
      applied: async () => {
        const [synced, page, reloading, readyState] = await state()
        const answered =
          synced === round.token && page !== undefined
            ? round.answers.get(page)
            : undefined
        if (answered === false) {
          // The server sent the page more meanwhile: sync after it
          nextRound()
        }
        if (synced !== round.token) {
          // (again: a page that reloaded meanwhile missed it)
          hot.send({
            type: 'custom',
            event: 'harness:sync',
            data: { token: round.token },
          })
        }
        return answered === true && !reloading && readyState === 'complete'
      },
      quiet: async () => {
        await server.idle()
        return inFlight() === 0
      },
      describe: async () =>
        `the page did not take in the server's HMR messages: ${JSON.stringify(await state())}`,
    })
  } finally {
    hot.off('harness:synced', onSynced)
  }
}
