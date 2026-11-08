/**
 * A generation the user's files make impossible (a route file that does not
 * parse, several files for one route, conflicting paths, a missing root
 * route): it fails `tsr generate` and builds, and dev reports it. Its text
 * is all there is to say, so its stack is the message (a bundler printing
 * the stack prints no generator internals).
 */
export class RouteGenerationError extends Error {
  /** The message without its prefix. */
  declare readonly detail: string

  constructor(detail: string) {
    super(`[tanstack-router] ${detail}`)
    // printed as its message alone (`console.error`, a bundler's report):
    // no stack, no own enumerable fields
    Object.defineProperty(this, 'detail', { value: detail })
    this.stack = this.message
  }
}
RouteGenerationError.prototype.name = 'RouteGenerationError'

/** How the generator's messages name a file: relative to the project root, `/`-separated (as the compiler's `displayPath`). */
export function displayFile(file: string, root: string): string {
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const p = file.replace(/\\/g, '/')
  return base !== '' && p.startsWith(`${base}/`) ? p.slice(base.length + 1) : p
}
