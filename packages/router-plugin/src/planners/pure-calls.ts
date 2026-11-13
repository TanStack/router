import type { RecognizerTable } from '@tanstack/router-utils/compiler'

/**
 * The package exports whose call is pure when its arguments are
 * (`RecognizerTable.pureCalls`), for every host of the router planner and
 * Start's: the core recognises them by import binding from these packages
 * (renamed, a namespace member, or a member of React's default import; app
 * re-exports are not followed), so a
 * module-level declaration they create is no effect and loads with the
 * split code that reads it. Each was read in the package's source,
 * development builds included: the call constructs and returns a value,
 * reads no global or module state, registers nothing, calls none of its
 * arguments and never throws. A call result has an identity, so a split
 * chunk never copies it; an export whose result must be one instance for
 * the program to work (a context) stays out all the same (Start's server-fn
 * provider copies what it reaches), as does one holding reactive state.
 */

/**
 * The router's own APIs, in every framework's router package. Not pure:
 * `redirect` and `notFound` (they mutate their argument and throw when
 * asked to), `createSerializationAdapter` (throws on an invalid key in
 * development), `createRouter`; the route factories are recognised as route
 * units (their routes are the route tree's).
 */
const ROUTER_EXPORTS = [
  'getRouteApi',
  'linkOptions',
  'createLink',
  'createRouteMask',
  'lazyRouteComponent',
  'lazyFn',
  'retainSearchParams',
  'stripSearchParams',
  'parseSearchWith',
  'stringifySearchWith',
]

type PureCallTable = Required<
  Pick<RecognizerTable, 'pureCalls' | 'pureDefaultNamespaces'>
>

let table: PureCallTable | null = null

/** The router's and the frameworks' pure exports, one table for every host (`RecognizerTable.pureCalls`). */
export function knownPureCalls(): PureCallTable {
  table ??= {
    pureCalls: {
      '@tanstack/react-router': new Set([
        ...ROUTER_EXPORTS,
        'createRouterConfig',
      ]),
      '@tanstack/solid-router': new Set(ROUTER_EXPORTS),
      '@tanstack/vue-router': new Set([
        ...ROUTER_EXPORTS,
        'createRouterConfig',
      ]),
      // the frameworks' component wrappers: React `memo` and `forwardRef` return
      // an element type (development warns on an invalid argument, stateless, and
      // reads only its `length`, `defaultProps` or `$$typeof`); `lazy` (React,
      // Solid) and Vue's `defineAsyncComponent` wrap a loader they call on first
      // render; Vue's `defineComponent` returns its options (or wraps a setup
      // function, reading its `name`). Not pure: `createContext` (React, Solid:
      // two instances are two contexts), `createRef`, React's `cache` (its
      // identity keys the cache), Solid's signals, stores and computations, Vue's
      // `ref`/`reactive` & co. (state), `markRaw` (writes its argument), `h`
      // (reads the current render instance), `defineCustomElement` (a class).
      react: new Set(['memo', 'forwardRef', 'lazy']),
      'solid-js': new Set(['lazy']),
      vue: new Set(['defineComponent', 'defineAsyncComponent']),
    },
    // React is CommonJS without `__esModule`: every bundler binds its
    // default import to its exports (Vue and Solid have no default export)
    pureDefaultNamespaces: new Set(['react']),
  }
  return table
}
