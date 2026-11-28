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
 * Page source of `untilInDom(container, read)`: resolves with what `read()`
 * gives once it is not `undefined`, checked now and on every change of the
 * DOM under `container` (a render, a state update after a server call);
 * rejects with the container's HTML when nothing shows within 8 s (the page
 * run's own bound is 10 s). Prepend it to a page script or a case module.
 */
export const untilInDom = `const untilInDom = (container, read) =>
  new Promise((resolve, reject) => {
    const done = (settle) => {
      observer.disconnect()
      clearTimeout(timer)
      settle()
    }
    const check = () => {
      const value = read()
      if (value !== undefined) {
        done(() => resolve(value))
      }
    }
    const observer = new MutationObserver(check)
    const timer = setTimeout(
      () => done(() => reject(new Error('nothing showed: ' + container.innerHTML))),
      8000,
    )
    observer.observe(container, { subtree: true, childList: true, characterData: true, attributes: true })
    check()
  })`

/**
 * A page expression of what the client must get of the options of the
 * middleware `middleware` (a page expression): its `type`, and whether a
 * server implementation or a validator ships (`server`, `validator`: `true`
 * when present). On the client both are absent, not stubs (SPEC J4.8);
 * other fields of `.options` (metadata a compiler adds) are free
 * (SPEC §5.19).
 */
export const clientMiddlewareOf = (middleware: string) =>
  `((options) => ({ type: options.type, server: options.server !== undefined, validator: options.validator !== undefined }))(${middleware}.options)`

/** What `clientMiddlewareOf` gives for a client middleware of `type`. */
export const clientMiddleware = (type: 'request' | 'function') => ({
  type,
  server: false,
  validator: false,
})

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
