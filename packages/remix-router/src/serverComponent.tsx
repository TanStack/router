/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  getPrerenderedHtml,
  nextClientInstanceId,
} from './serverComponentClient'
import type { Handle, RemixNode } from '@remix-run/ui'

const SERVER_COMPONENT_BRAND = Symbol.for(
  '@tanstack/remix-router/serverComponent',
)

const isServer = typeof document === 'undefined'

// ===========================================================================
// Registry
// ===========================================================================

const registry = new Map<string, ServerComponentEntry<any>>()

export interface ServerComponentEntry<TProps> {
  id: string
  factory: (handle: Handle<TProps>) => (props: TProps) => RemixNode
}

export interface ServerComponentMarker<TProps> {
  $serverComponentId: string
  [SERVER_COMPONENT_BRAND]: true
  __remixServerComponentProps?: TProps
}

export type ServerComponent<TProps> = ServerComponentMarker<TProps> &
  ((handle: Handle<TProps>) => (props: TProps) => RemixNode)

function clientStrippedFactory<TProps>(
  _handle: Handle<TProps>,
): (props: TProps) => RemixNode {
  return () => null
}

// ===========================================================================
// Per-request SSR collector
// ===========================================================================

export interface ServerComponentPayloadEntry {
  id: string
  props: unknown
}

export interface ServerComponentCollector {
  next: () => string
  record: (instanceId: string, entry: ServerComponentPayloadEntry) => void
  drain: () => Record<string, ServerComponentPayloadEntry>
}

let activeCollector: ServerComponentCollector | null = null

export function createServerComponentCollector(): ServerComponentCollector {
  const entries: Record<string, ServerComponentPayloadEntry> = {}
  let counter = 0
  return {
    next() {
      counter += 1
      return `s${counter}`
    },
    record(instanceId, entry) {
      entries[instanceId] = entry
    },
    drain() {
      const out = entries
      counter = 0
      return out
    },
  }
}

export function activateServerComponentCollector(
  collector: ServerComponentCollector,
): void {
  activeCollector = collector
}

export function deactivateServerComponentCollector(): void {
  activeCollector = null
}

export function getActiveServerComponentCollector(): ServerComponentCollector | null {
  return activeCollector
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Mark a component as server-only.
 *
 * The factory body runs **only on the server**. The returned wrapper is
 * itself the SSR boundary — author code uses it as JSX directly, no
 * `<ServerSlot>` indirection:
 *
 * ```tsx
 * const UserBio = serverComponent('@/UserBio', function (h) {
 *   return ({ user }) => <article>{user.name}</article>
 * })
 *
 * function UserDetail(handle: Handle) {
 *   const data = useLoaderData(handle, { from: '/users/$id' })
 *   return () => <UserBio user={data()} />     // ← just JSX
 * }
 * ```
 *
 * On the server: brackets the rendered output in
 * `<span data-rmx-sc="sN" data-rmx-sc-id="…" style="display:contents">…</span>`
 * and records `(id, props)` in the active SSR collector.
 *
 * On the client (after the Vite plugin runs): the factory is stripped to
 * `null`. The wrapper emits the same span shell with `innerHTML` from
 * the SSR-captured map, so the existing DOM survives hydration.
 *
 * Build-plugin contract: see `@tanstack/remix-router/vite`'s
 * `remixServerComponents()`. Without the plugin the factory still runs
 * client-side too — correct behaviour, just no bundle savings.
 */
export function serverComponent<TProps>(
  id: string,
  factory:
    | ((handle: Handle<TProps>) => (props: TProps) => RemixNode)
    | null
    | undefined,
): ServerComponent<TProps> {
  const resolved = factory ?? clientStrippedFactory<TProps>

  if (process.env.NODE_ENV !== 'production' && registry.has(id)) {
    const existing = registry.get(id)!
    if (existing.factory !== resolved && factory != null) {
      console.warn(
        `[remix-router] serverComponent id "${id}" was registered twice with different factories. ` +
          'IDs must be globally unique.',
      )
    }
  }
  if (factory != null || !registry.has(id)) {
    registry.set(id, { id, factory: resolved })
  }

  const wrapper = function ServerComponentWrapper(handle: Handle<TProps>) {
    return (props: TProps): RemixNode => {
      if (isServer) {
        let instanceId: string | undefined
        if (activeCollector) {
          instanceId = activeCollector.next()
          activeCollector.record(instanceId, { id, props: props as unknown })
        }
        const entry = registry.get(id)!
        const inner = entry.factory(handle as Handle<TProps>)
        return (
          <span
            data-rmx-sc={instanceId}
            data-rmx-sc-id={id}
            style="display:contents"
          >
            {inner(props) as RemixNode}
          </span>
        )
      }

      // Client: don't run the factory — the Vite plugin has stripped
      // it to `null` in production. Re-emit the span using the captured
      // innerHTML so the reconciler diff is a no-op.
      const instanceId = nextClientInstanceId()
      const html = getPrerenderedHtml(instanceId) ?? ''
      return (
        <span
          data-rmx-sc={instanceId}
          data-rmx-sc-id={id}
          style="display:contents"
          innerHTML={html}
        />
      )
    }
  } as ServerComponent<TProps>

  ;(wrapper as any).$serverComponentId = id
  ;(wrapper as any)[SERVER_COMPONENT_BRAND] = true
  return wrapper
}

export function isServerComponent(
  value: unknown,
): value is ServerComponent<any> {
  return (
    typeof value === 'function' &&
    (value as any)[SERVER_COMPONENT_BRAND] === true
  )
}

export function getServerComponent<TProps = unknown>(
  id: string,
): ServerComponentEntry<TProps> | undefined {
  return registry.get(id) as ServerComponentEntry<TProps> | undefined
}

export function _resetServerComponentRegistry(): void {
  registry.clear()
}
