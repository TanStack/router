/**
 * Client-side runtime for the server-component model. Reads the
 * SSR-emitted `<script id="rmx-sc-payload" type="application/json">`,
 * indexes the `<span data-rmx-sc="sN">` elements in the document, and
 * exposes `reRenderServerComponent(instanceId, nextProps)` so callers
 * (typically a router-onLoad hook) can request a fresh render from the
 * server and swap it in via `innerHTML`.
 *
 * Lives in client-only code: don't import from server entries. The
 * runtime is small (~70 LOC) and tree-shakes out for apps that don't
 * use `serverComponent()`.
 */
import type { ServerComponentPayloadEntry } from './serverComponent'

const PAYLOAD_SCRIPT_ID = 'rmx-sc-payload'

/**
 * Indexed in-memory copy of the SSR payload. Populated by
 * {@link initServerComponentClient}; updated by
 * {@link reRenderServerComponent} when the props of a known instance
 * change.
 */
const instances = new Map<string, ServerComponentPayloadEntry>()

/**
 * `<span data-rmx-sc>`-keyed map of the inner HTML the server rendered
 * into each instance. Captured at boot (before the reconciler has a
 * chance to clobber the content) and read by `RenderServerComponent`
 * during initial hydration so it can re-emit the exact same `innerHTML`
 * — which makes the reconciler's diff a no-op.
 */
const prerenderedHtml = new Map<string, string>()

/**
 * Per-render counter used to derive `instanceId`s on the client. Both
 * server and client increment in document order, so as long as the
 * render order matches the server's, `s1, s2, s3, …` line up.
 */
let clientCounter = 0

/**
 * Reset the client counter. Called by `mountRouter` right before the
 * first reconcile so the first server-component encountered gets `s1`,
 * matching the server. Tests use this to start clean too.
 */
export function resetClientInstanceCounter(): void {
  clientCounter = 0
}

/**
 * Generate the next client-side instance id. Mirrors the server's
 * `collector.next()` counter so the ids align under matched render
 * order.
 */
export function nextClientInstanceId(): string {
  clientCounter += 1
  return `s${clientCounter}`
}

/**
 * Look up the server-rendered inner HTML for an instance. Returns
 * `undefined` for instances that don't have prerendered content (e.g.
 * post-navigation server components — those need a re-render fetch).
 */
export function getPrerenderedHtml(instanceId: string): string | undefined {
  return prerenderedHtml.get(instanceId)
}

/**
 * Walk the document for `[data-rmx-sc]` elements and return the matching
 * one. Cached on first lookup.
 */
const elementCache = new Map<string, HTMLElement>()
function findElement(instanceId: string): HTMLElement | null {
  const cached = elementCache.get(instanceId)
  if (cached?.isConnected) return cached
  if (typeof document === 'undefined') return null
  const el = document.querySelector<HTMLElement>(
    `[data-rmx-sc="${cssEscape(instanceId)}"]`,
  )
  if (el) elementCache.set(instanceId, el)
  return el
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s)
  }
  return s.replace(/["\\]/g, '\\$&')
}

/**
 * Read the SSR payload, prime the in-memory `instances` map, and
 * capture the server-rendered `innerHTML` of each `<span data-rmx-sc>`
 * element so the client-side `RenderServerComponent` can re-emit it
 * verbatim during initial hydration.
 *
 * Call this **before** the first reconcile (`mountRouter` does this
 * automatically). Idempotent.
 */
export function initServerComponentClient(): void {
  if (typeof document === 'undefined') return
  if (instances.size === 0) {
    const script = document.getElementById(PAYLOAD_SCRIPT_ID)
    if (script?.textContent) {
      try {
        const parsed = JSON.parse(script.textContent) as Record<
          string,
          ServerComponentPayloadEntry
        >
        for (const [instanceId, entry] of Object.entries(parsed)) {
          instances.set(instanceId, entry)
        }
      } catch (err) {
        console.warn('[remix-router] failed to parse SC payload:', err)
      }
    }
  }
  if (prerenderedHtml.size === 0) {
    const els = document.querySelectorAll<HTMLElement>('[data-rmx-sc]')
    for (const el of els) {
      const sN = el.getAttribute('data-rmx-sc')
      if (sN) prerenderedHtml.set(sN, el.innerHTML)
    }
  }
  resetClientInstanceCounter()
}

/**
 * Look up the `(id, props)` registered for a server-component instance.
 * Used by tests and by call sites that want to inspect the payload.
 */
export function getServerComponentInstance(
  instanceId: string,
): ServerComponentPayloadEntry | undefined {
  return instances.get(instanceId)
}

/**
 * Iterate every known server-component instance. Useful for the route
 * onLoad hook to walk all instances and re-render any whose props
 * depend on changed loader data.
 */
export function listServerComponentInstances(): IterableIterator<
  [string, ServerComponentPayloadEntry]
> {
  return instances.entries()
}

/**
 * Options for {@link reRenderServerComponent}.
 */
export interface ReRenderOptions {
  /** Path prefix where the re-render endpoint is mounted. Default: `/_sc`. */
  base?: string
  /** Override the request init (e.g. add headers). */
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

/**
 * Re-render a server component on the server and swap its rendered
 * markup into the matching `<span data-rmx-sc="instanceId">` element on
 * the client. Updates the in-memory props copy on success.
 *
 * No-ops if the instance is unknown or the matching element is no
 * longer in the document.
 */
export async function reRenderServerComponent(
  instanceId: string,
  nextProps: unknown,
  opts: ReRenderOptions = {},
): Promise<void> {
  const entry = instances.get(instanceId)
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[remix-router] reRenderServerComponent: unknown instance "${instanceId}"`,
      )
    }
    return
  }
  const el = findElement(instanceId)
  if (!el) return

  const base = (opts.base ?? '/_sc').replace(/\/+$/, '')
  const url = `${base}/${encodeURIComponent(entry.id)}`
  const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis)

  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(nextProps ?? {}),
  })
  if (!res.ok) {
    throw new Error(
      `[remix-router] re-render of "${entry.id}" failed: ${res.status} ${res.statusText}`,
    )
  }
  const html = await res.text()

  // Drop in the new markup. We use innerHTML rather than a `remix/ui`
  // virtual root because the body of a server component never has its
  // own JS — it's pure markup. If the rendered HTML contains a nested
  // `clientEntry` (which would need hydration), the build plugin would
  // have lifted that to be rendered as part of the client island, not
  // the server component. Future work: hydrate nested entries inside
  // a re-rendered SC via `createRangeRoot` + `loadModule`.
  el.innerHTML = html

  instances.set(instanceId, { ...entry, props: nextProps })
}

/**
 * For tests / hot-reload: clear the runtime state.
 */
export function _resetServerComponentClient(): void {
  instances.clear()
  elementCache.clear()
  prerenderedHtml.clear()
  clientCounter = 0
}
