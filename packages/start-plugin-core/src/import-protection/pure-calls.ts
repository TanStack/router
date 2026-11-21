import type { RecognizerTable } from '@tanstack/router-utils/compiler'

/**
 * The package exports whose call is pure when its arguments are
 * (`RecognizerTable.pureCalls`), for import protection's effect model: the
 * core recognises them by import binding from these packages (renamed, or a
 * namespace member; app re-exports are not followed), so a module-level declaration they create is no effect
 * of the module's own code. Each was read in the package's source,
 * development builds included: the call constructs and returns a value,
 * reads no global or module state, registers nothing, calls none of its
 * arguments and never throws. An export whose result must be one instance
 * for the program to work (a context) stays out, as does one holding
 * reactive state.
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

type PureCallTable = Required<Pick<RecognizerTable, 'pureCalls'>>

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
      // Solid's `lazy` wraps a loader it calls on first render. Not pure:
      // `createContext` (two instances are two contexts), signals, stores and
      // computations. React and Vue have no rows: neither declares
      // `sideEffects: false`, so importing one already makes a module effectful
      // (`edges.ts`, `describeTarget`)
      'solid-js': new Set(['lazy']),
    },
  }
  return table
}
