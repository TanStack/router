import type { Page } from '@playwright/test'

export interface HmrObserverEvent {
  kind: string
  detail: string
  at: number
}

export interface HmrObserverState {
  lastActivityAt: number
  installedAt: number
  events: Array<HmrObserverEvent>
}

declare global {
  interface Window {
    __HMR_OBSERVER_INSTALLED__?: boolean
    __HMR_OBSERVER__?: HmrObserverState
  }
}

/**
 * Bundler-agnostic HMR observability for e2e tests.
 *
 * Why this exists:
 *   - HMR e2e tests rapidly write source files between assertions/tests.
 *   - On slow CI machines the dev server's file watcher can:
 *       * coalesce two writes into one HMR batch (so the second edit appears
 *         to "vanish")
 *       * emit a full-page program reload mid-test
 *       * still be processing the previous test's restore write when the
 *         current test starts editing
 *   - Locally these races almost never happen because the watcher latency is
 *     smaller than the spacing between writes.
 *   - The fix is to give tests a deterministic way to wait for the dev server
 *     to be *idle* (no in-flight HMR messages for some quiet window) and to
 *     wait for a *specific* HMR event after a write.
 *
 * Implementation:
 *   We hook `WebSocket` at page-init time and record every incoming text frame
 *   into a global ring buffer plus a "last activity" timestamp. Both Vite and
 *   Rsbuild/Rspack push HMR notifications over WebSocket, so this works for
 *   either toolchain without any app-side instrumentation.
 *
 *   We also record full-page navigations (Vite "program reload"/page reload,
 *   Rsbuild full reload) as activity so the idle barrier covers them too.
 */

function hmrObserverInitScript() {
  if (window.__HMR_OBSERVER_INSTALLED__) return
  window.__HMR_OBSERVER_INSTALLED__ = true

  const state: HmrObserverState = {
    lastActivityAt: 0,
    events: [],
    installedAt: Date.now(),
  }
  window.__HMR_OBSERVER__ = state

  function record(kind: string, detail: string) {
    const now = Date.now()
    state.lastActivityAt = now
    if (state.events.length > 200) state.events.shift()
    state.events.push({ kind: kind, detail: detail, at: now })
  }

  // Mark the page itself loading as activity. Captures Vite "program reload"
  // and any other full-page reloads.
  record('navigate', location.pathname + location.search)

  const NativeWebSocket = window.WebSocket
  const PatchedWebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | Array<string>) {
      if (protocols === undefined) {
        super(url)
      } else {
        super(url, protocols)
      }

      try {
        record('ws:open', String(url))
        this.addEventListener('message', function (ev) {
          let detail = ''
          try {
            detail =
              typeof ev.data === 'string' ? ev.data.slice(0, 200) : '[binary]'
          } catch {
            detail = '[unreadable]'
          }
          record('ws:message', detail)
        })
        this.addEventListener('close', function () {
          record('ws:close', String(url))
        })
        this.addEventListener('error', function () {
          record('ws:error', String(url))
        })
      } catch {
        // never let our instrumentation break the page
      }
    }
  }
  window.WebSocket = PatchedWebSocket

  // Vite-specific: listen for HMR lifecycle events when available. Rsbuild's
  // client does not expose equivalent window lifecycle events, so Rsbuild is
  // covered by the generic WebSocket message observer above.
  for (const evt of [
    'vite:beforeUpdate',
    'vite:afterUpdate',
    'vite:beforeFullReload',
    'vite:beforePrune',
    'vite:invalidate',
    'vite:error',
    'vite:ws:disconnect',
    'vite:ws:connect',
  ]) {
    window.addEventListener(evt, function (ev) {
      let detail = ''
      try {
        detail = JSON.stringify(
          ev instanceof CustomEvent ? ev.detail : null,
        ).slice(0, 200)
      } catch {
        detail = '[unserializable]'
      }
      record(evt, detail)
    })
  }
}

const HMR_OBSERVER_INIT_SCRIPT = `(${hmrObserverInitScript.toString()})()`

/**
 * Installs the HMR observer for every page in the given context/test.
 * Must be called before navigation (e.g. inside a beforeEach via the
 * provided fixture), otherwise the first WebSocket may be missed.
 */
export async function installHmrObserver(page: Page) {
  await page.addInitScript({ content: HMR_OBSERVER_INIT_SCRIPT })
}

async function readObserver(page: Page): Promise<HmrObserverState | null> {
  return await page.evaluate(() => {
    const s = window.__HMR_OBSERVER__
    if (!s) return null
    return {
      lastActivityAt: s.lastActivityAt,
      installedAt: s.installedAt,
      events: s.events.slice(-50),
    }
  })
}

export async function ensureHmrObserver(page: Page): Promise<void> {
  const observer = await readObserver(page).catch(() => null)
  if (observer) return

  await page.evaluate(HMR_OBSERVER_INIT_SCRIPT)
}

export interface WaitForHmrIdleOptions {
  /**
   * The quiet window the dev server must be silent for, in ms. Defaults to
   * 750ms which empirically covers Vite's full-reload + Rsbuild's rebuild
   * settle time on slow CI workers.
   */
  quietWindowMs?: number
  /**
   * Maximum total time to wait. Defaults to 20s.
   */
  timeoutMs?: number
  /**
   * Polling interval. Defaults to 100ms.
   */
  pollIntervalMs?: number
}

/**
 * Waits until the dev server has been idle (no HMR/WebSocket activity and no
 * navigations) for at least `quietWindowMs`. Use this between tests and after
 * file restores to ensure HMR events from previous edits don't leak into the
 * next assertion.
 */
export async function waitForHmrIdle(
  page: Page,
  opts: WaitForHmrIdleOptions = {},
): Promise<void> {
  const quietWindowMs = opts.quietWindowMs ?? 750
  const timeoutMs = opts.timeoutMs ?? 20_000
  const pollIntervalMs = opts.pollIntervalMs ?? 100

  const deadline = Date.now() + timeoutMs
  let sawObserver = false

  while (Date.now() < deadline) {
    const observer = await readObserver(page).catch(() => null)
    if (observer) {
      sawObserver = true
      const sinceLast = Date.now() - observer.lastActivityAt
      if (sinceLast >= quietWindowMs) return
    }
    await page.waitForTimeout(pollIntervalMs)
  }

  if (!sawObserver) {
    throw new Error(
      'waitForHmrIdle: HMR observer is not installed on the current page. ' +
        'Call installHmrObserver before navigation or ensureHmrObserver after navigation.',
    )
  }

  const observer = await readObserver(page).catch(() => null)
  const lastEvents = observer?.events.slice(-5) ?? []
  throw new Error(
    `waitForHmrIdle: dev server did not become idle within ${timeoutMs}ms ` +
      `(quietWindowMs=${quietWindowMs}). Last events: ` +
      JSON.stringify(lastEvents),
  )
}

export interface WaitForHmrEventOptions {
  /**
   * Only consider events that occurred after this timestamp (ms since epoch).
   * Use the timestamp captured immediately before triggering the edit.
   */
  since: number
  /**
   * Predicate matched against each event's stringified detail. The first event
   * (after `since`) whose detail includes/matches this needle resolves the
   * promise.
   */
  match: string | RegExp
  kind?: string | RegExp
  /**
   * Maximum time to wait. Defaults to 20s.
   */
  timeoutMs?: number
  /**
   * Polling interval. Defaults to 100ms.
   */
  pollIntervalMs?: number
}

/**
 * Waits for a specific HMR event matching `match` to appear after `since`.
 * Useful to confirm an edit actually produced an HMR update for the expected
 * file before asserting on DOM.
 */
export async function waitForHmrEvent(
  page: Page,
  opts: WaitForHmrEventOptions,
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const pollIntervalMs = opts.pollIntervalMs ?? 100
  const deadline = Date.now() + timeoutMs
  let sawObserver = false

  const matches = (detail: string) =>
    typeof opts.match === 'string'
      ? detail.includes(opts.match)
      : opts.match.test(detail)

  const matchesKind = (kind: string) => {
    if (!opts.kind) return true
    return typeof opts.kind === 'string'
      ? kind === opts.kind
      : opts.kind.test(kind)
  }

  while (Date.now() < deadline) {
    const observer = await readObserver(page).catch(() => null)
    if (observer) {
      sawObserver = true
      for (const evt of observer.events) {
        if (
          evt.at >= opts.since &&
          matchesKind(evt.kind) &&
          matches(evt.detail)
        ) {
          return
        }
      }
    }
    await page.waitForTimeout(pollIntervalMs)
  }

  if (!sawObserver) {
    throw new Error(
      'waitForHmrEvent: HMR observer is not installed on the current page. ' +
        'Call installHmrObserver before navigation or ensureHmrObserver after navigation.',
    )
  }

  const observer = await readObserver(page).catch(() => null)
  const lastEvents = observer?.events.slice(-10) ?? []
  throw new Error(
    `waitForHmrEvent: no event matching ${String(opts.match)} since ` +
      `${opts.since} within ${timeoutMs}ms. Recent events: ` +
      JSON.stringify(lastEvents),
  )
}

/**
 * Returns the timestamp of the most recent HMR-related activity observed
 * by the page, or 0 if the observer has not yet recorded anything.
 */
export async function getHmrLastActivityAt(page: Page): Promise<number> {
  const observer = await readObserver(page).catch(() => null)
  return observer?.lastActivityAt ?? 0
}

export async function getHmrObserverTime(page: Page): Promise<number> {
  return await page.evaluate(() => Date.now())
}
