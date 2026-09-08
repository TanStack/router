import type { AnyRouter } from '@tanstack/router-core'

type ServerSsr = NonNullable<AnyRouter['serverSsr']>

/**
 * Indirection between the Router constructor (main entry, bundled for both
 * peers) and the SSR-transfer installer (ssr/server entry only).
 *
 * The installer pulls `@solidjs/web/serialization` — Solid's server-side
 * encode module — which must never enter the client module graph (the Solid
 * vite plugin treats it as server-only; a client bundle that reaches it
 * loses its entry emission). The constructor therefore registers only a
 * thin lifecycle listener against this slot, and importing
 * `@tanstack/solid-router/ssr/server` (which every Solid SSR/Start server
 * path does before rendering) fills it. Unfilled — e.g. a client bundle, or
 * a server that attaches router-core's serverSsr without Solid's ssr/server
 * module — the listener is a no-op and core's script channel runs unchanged.
 */
export const solidSsrTransfer: {
  install?: (router: AnyRouter, serverSsr: ServerSsr) => void
} = {}
