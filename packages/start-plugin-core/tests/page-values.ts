/**
 * Helpers for checks that compare values a module computes, on the client
 * (a page script of `StartCase.client` / `inPage`, whose result crosses
 * JSON) and on the server (the same script run in Node on the module the SSR
 * environment evaluated).
 */
import { pagePrelude } from './start-host'

/**
 * Page source of `shapeOf(value)`: the value as JSON, functions spelled
 * `'<function>'` and object properties whose value is `undefined` left out
 * (what `toEqual` ignores too), so a function-valued property is never
 * mistaken for an absent one. Prepend it to a page script.
 */
export const shapeOf = `const shapeOf = (value) => JSON.parse(JSON.stringify(value, (key, inner) => typeof inner === 'function' ? '<function>' : inner) ?? 'null')`

/**
 * Runs a page-style `script` (an async function body with `module`, the
 * prelude's `settle` and `shapeOf` in scope) in Node, on `module` (e.g. what
 * `StartCase.ssr()` gave): the same check on the server's module.
 */
export function runOnServerModule<T = unknown>(
  module: Record<string, any>,
  script: string,
): Promise<T> {
  return new Function(
    'module',
    `return (async () => {\n${pagePrelude}\n${shapeOf}\n${script}\n})()`,
  )(module) as Promise<T>
}
