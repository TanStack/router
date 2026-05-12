/**
 * `@tanstack/remix-start` — Start adapter for Remix 3.
 *
 * Mirrors the surface of `@tanstack/react-start` and
 * `@tanstack/solid-start`: this entry point exposes only the
 * Start-specific pieces (server functions, middleware,
 * `useServerFn`). For routing primitives import from
 * `@tanstack/remix-router` directly — keeping these as separate
 * imports matches the React/Solid pattern and makes it obvious which
 * package owns which surface.
 */

// Server-fn redirect interceptor (Remix-binding flavor).
export { useServerFn } from './useServerFn'

// Start primitives that don't depend on the framework binding.
export * from '@tanstack/start-client-core'
