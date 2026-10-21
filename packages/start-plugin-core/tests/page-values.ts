/**
 * Helpers for checks that compare values a module computes, on the client
 * (a page script of `StartCase.client` / `inPage`, whose result crosses
 * JSON) and on the server (the same script run in Node on the module the SSR
 * environment evaluated).
 */
import { pagePrelude } from './start-host'
import type { StartHostOptions } from './start-host'

/**
 * The host defaults of the B2 lead's branch, for the hosts of these files
 * until that branch is merged (then redundant): Start's import protection
 * off (in dev it hands the client a mock of a denied `*.server.*` import),
 * and an app tsconfig.json with `verbatimModuleSyntax` (Vite's TypeScript
 * transform then keeps value imports the compiler left, instead of erasing
 * unreferenced ones). A case directory's own tsconfig.json overrides it.
 */
export function withHostDefaults(
  options: StartHostOptions = {},
): StartHostOptions {
  return {
    ...options,
    start: { importProtection: { enabled: false }, ...options.start },
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          verbatimModuleSyntax: true,
        },
      }),
      ...options.files,
    },
  }
}

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
