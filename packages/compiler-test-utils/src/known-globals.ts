/**
 * Names code may read without declaring or importing them: the globals the
 * environments it runs in define. Shared by the validator of generated
 * modules (`validate-module.ts`) and the check of production client chunks
 * (`build-harness.ts`).
 *
 * Every global of the target counts, generic browser names (`name`,
 * `status`, `event`, `top`...) included: reading one is valid code. A
 * compiler bug that drops a local binding with such a name is found from
 * binding evidence instead (the `source` option of `getModuleErrors`), or
 * by running the output.
 */
import globals from 'globals'

/**
 * Language globals the `globals` package (16.x) does not list yet:
 * `Temporal`, which browsers and Node.js 26 define (Start's serializer,
 * seroval, revives Temporal values with it).
 */
const languageNames = ['Temporal']

/** Globals a framework's own code defines for itself, which its runtime reads. */
const frameworkNames = [
  // the hydration state the script of Solid's `generateHydrationScript()`
  // creates, which `solid-js/web` reads while hydrating.
  '_$HY',
  // Vue's compile-time feature flags: a Vue build plugin defines them, and
  // without one Vue's runtime assigns them to `globalThis` before reading
  // them (`initFeatureFlags()`).
  '__VUE_OPTIONS_API__',
  '__VUE_PROD_DEVTOOLS__',
  '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__',
]

/**
 * The globals browser code can count on: the language's, the browser's and
 * the framework globals. No Node.js-only global (`process`, `Buffer`,
 * `global`, `setImmediate`...): production client builds of Vite, Rspack and
 * webpack replace `process.env.NODE_ENV` (and webpack and Rspack `global`),
 * so a read of a Node-only global that survives in a client chunk throws in
 * a browser, unless a `typeof` check guards it (see `unboundNames`).
 */
export const clientGlobals: ReadonlySet<string> = new Set([
  ...Object.keys(globals.builtin),
  ...languageNames,
  ...Object.keys(globals.browser),
  ...frameworkNames,
])

/**
 * The globals server code can count on: the language's and those of
 * Node.js as an ES module sees them (no CommonJS wrapper variables such as
 * `require` or `__dirname`), without the browser's (`window`, `document`:
 * a read of one that survives in server code throws in Node.js, unless a
 * `typeof` check guards it).
 */
export const serverGlobals: ReadonlySet<string> = new Set([
  ...Object.keys(globals.builtin),
  ...languageNames,
  ...Object.keys(globals.nodeBuiltin),
  ...frameworkNames,
])

/**
 * The globals of code that may run on the client or the server
 * (`universal`): the client globals and the server globals. A module known
 * to run on one side reads only that side's (`clientGlobals`,
 * `serverGlobals`): this union admits `process` in a client module.
 */
export const knownGlobals: ReadonlySet<string> = new Set([
  ...clientGlobals,
  ...Object.keys(globals.nodeBuiltin),
])
