/**
 * Static server/client detection for tree-shaking support.
 *
 * This file re-exports `isServer` from `@tanstack/router-is-server` which uses
 * conditional exports to provide different values based on the environment:
 *
 * - `browser` condition → `false` (client)
 * - `node`/`worker`/`deno`/`bun` → `true` (server)
 * - `development` condition → `undefined` (for tests, falls back to router.isServer)
 *
 * The bundler resolves the correct file at build time based on export conditions,
 * and since the value is a literal constant, dead code can be eliminated.
 *
 * @example
 * ```typescript
 * import { isServer } from '@tanstack/router-core'
 *
 * // The ?? operator provides fallback for development/test mode
 * if (isServer ?? router.isServer) {
 *   // Server-only code - eliminated in client bundles
 * }
 * ```
 */
export { isServer } from '@tanstack/router-is-server'
