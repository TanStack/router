/**
 * Server-side exports for `@tanstack/remix-start`. Combines:
 *
 * - The TanStack Router SSR pipeline (`createRouterHandler` from
 *   `@tanstack/remix-router/server`)
 * - The framework-agnostic server-function dispatcher
 *   (`handleServerAction` from `@tanstack/start-server-core`)
 *
 * into a single `createStartHandler` — a plain
 * `(request: Request) => Promise<Response>` that an app wires up
 * however its deployment adapter prefers.
 */

export * from '@tanstack/remix-router/server'
export { createStartHandler, createStartApp } from './createStartHandler'
export type {
  CreateStartHandlerOptions,
  StartRequestHandler,
} from './createStartHandler'
