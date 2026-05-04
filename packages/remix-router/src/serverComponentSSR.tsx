/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { isServerComponent } from './serverComponent'
import {
  getPrerenderedHtml,
  nextClientInstanceId,
} from './serverComponentClient'
import type { Handle, RemixNode } from '@remix-run/ui'

const isServer = typeof document === 'undefined'

/**
 * Server-side payload entry for a single rendered server component.
 * Indexed by an opaque per-render `instanceId` (`sN`) so the client
 * runtime can map a `<span data-rmx-sc="sN">` element back to its
 * `(id, props)` for re-render requests.
 */
export interface ServerComponentPayloadEntry {
  id: string
  props: unknown
}

/**
 * Per-request collector of server-component instances. Created by
 * `createServerComponentCollector` at the top of a render and read by
 * the server adapter at render-end to emit the JSON payload alongside
 * the dehydration script.
 */
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

/**
 * SSR boundary used by `<RenderServerComponent>`. Wraps the server
 * component's output in a `<span data-rmx-sc="sN" data-rmx-sc-id="…"
 * style="display:contents">` element so the client can identify the
 * bracketed range without needing comment markers, and registers
 * `(id, props)` in the active collector.
 *
 * Build-plugin behavior (when wired): replace this body with a stub that
 * emits only the `<span>` shell — the original factory body never ships
 * to the client. For now, in client builds, this still runs the factory
 * inline; useful for tests and incremental adoption.
 */
export interface RenderServerComponentProps {
  /** The marker'd component returned from `serverComponent()`. */
  Component: ((handle: Handle<any>) => (props: any) => RemixNode) & {
    $serverComponentId?: string
  }
  /** Props to render the component with. JSON-serialized into the payload. */
  props: any
}

export function RenderServerComponent(
  handle: Handle<RenderServerComponentProps>,
) {
  void handle
  return (props: RenderServerComponentProps): RemixNode => {
    const { Component, props: childProps } = props
    if (!isServerComponent(Component)) {
      throw new Error(
        '[remix-router] <RenderServerComponent> received a Component that was not produced by serverComponent().',
      )
    }
    const id = (Component as any).$serverComponentId as string

    if (isServer) {
      // Server render: assign an instance id, record `(id, props)` in the
      // collector, and inline the factory's actual output.
      let instanceId: string | undefined
      const collector = activeCollector
      if (collector) {
        instanceId = collector.next()
        collector.record(instanceId, { id, props: childProps })
      }
      const InnerFactory = Component as (
        h: Handle<any>,
      ) => (p: any) => RemixNode
      return (
        <span
          data-rmx-sc={instanceId}
          data-rmx-sc-id={id}
          style="display:contents"
        >
          <InnerFactory {...childProps} />
        </span>
      )
    }

    // Client render: don't run the factory body — its bundle has been
    // stripped by the Vite plugin in production. Instead, re-emit the
    // span with `innerHTML` set to whatever the SSR markup contained.
    // This makes the reconciler's diff a no-op against the existing DOM
    // (the innerHTML matches), so the server-rendered content survives
    // hydration without us needing a per-element "preserve" hook.
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
}

/**
 * JSX-friendly helper:
 *
 * ```tsx
 * <ServerSlot Component={UserCard} props={{ userId: 7 }} />
 * ```
 */
export function ServerSlot(handle: Handle<RenderServerComponentProps>) {
  void handle
  return (p: RenderServerComponentProps): RemixNode => (
    <RenderServerComponent Component={p.Component} props={p.props} />
  )
}
