/**
 * Recognition of the Start packages by specifier: the
 * `RecognizerTable` the core's value analysis and summaries use. Known
 * packages are never resolved; their exports map to kinds.
 */
import { routerPureCalls } from '@tanstack/router-plugin/planners'
import type { RecognizerTable } from '@tanstack/router-utils/compiler'
import type { CompileStartFrameworkOptions } from '../types'

export const START_KINDS = {
  serverFn: 'serverFn',
  middleware: 'middleware',
  isoFn: 'isoFn',
  serverOnly: 'serverOnly',
  clientOnly: 'clientOnly',
  start: 'start',
  clientOnlyJsx: 'clientOnlyJsx',
  rscRender: 'rsc:render',
  rscComposite: 'rsc:composite',
  rscStream: 'rsc:stream',
} as const

type StartKind = (typeof START_KINDS)[keyof typeof START_KINDS]

const FRAMEWORKS: Array<CompileStartFrameworkOptions> = [
  'react',
  'solid',
  'vue',
]

const FACTORY_EXPORTS: Record<string, StartKind> = {
  createServerFn: START_KINDS.serverFn,
  createMiddleware: START_KINDS.middleware,
  createIsomorphicFn: START_KINDS.isoFn,
  createServerOnlyFn: START_KINDS.serverOnly,
  createClientOnlyFn: START_KINDS.clientOnly,
  createStart: START_KINDS.start,
}

const STUB_EXPORTS: Record<string, StartKind> = {
  createIsomorphicFn: START_KINDS.isoFn,
  createServerOnlyFn: START_KINDS.serverOnly,
  createClientOnlyFn: START_KINDS.clientOnly,
}

const RSC_EXPORTS: Record<string, StartKind> = {
  renderServerComponent: START_KINDS.rscRender,
  createCompositeComponent: START_KINDS.rscComposite,
  renderToReadableStream: START_KINDS.rscStream,
}

let table: RecognizerTable | null = null

/** The one recognizer table of Start (every framework's packages; recognition is by specifier). */
export function startRecognizer(): RecognizerTable {
  if (table) {
    return table
  }
  const factories: Record<string, Record<string, string>> = {
    '@tanstack/start-client-core': { ...FACTORY_EXPORTS },
    '@tanstack/start-fn-stubs': { ...STUB_EXPORTS },
    '@tanstack/react-start-rsc': { ...RSC_EXPORTS },
    '@tanstack/react-start/rsc': { ...RSC_EXPORTS },
  }
  for (const fw of FRAMEWORKS) {
    factories[`@tanstack/${fw}-start`] = { ...FACTORY_EXPORTS }
    factories[`@tanstack/${fw}-router`] = {
      ClientOnly: START_KINDS.clientOnlyJsx,
    }
  }
  table = {
    factories,
    builderKinds: new Set([
      START_KINDS.serverFn,
      START_KINDS.middleware,
      START_KINDS.isoFn,
    ]),
    terminal: {
      [START_KINDS.serverFn]: 'serverFn',
      [START_KINDS.middleware]: 'middleware',
      [START_KINDS.isoFn]: 'isoFn',
    },
    envOnlyKinds: {
      [START_KINDS.serverOnly]: 'server',
      [START_KINDS.clientOnly]: 'client',
    },
    startKind: START_KINDS.start,
    startMembers: { createMiddleware: START_KINDS.middleware },
    // the router's own pure APIs: its table, not a copy
    pureCalls: routerPureCalls(),
  }
  return table
}

/** The runtime helper specifiers the planners' glue imports (compiler-owned, exempt from J6). */
export function runtimeSpecifiers(framework: CompileStartFrameworkOptions) {
  return {
    clientRpc: `@tanstack/${framework}-start/client-rpc`,
    ssrRpc: `@tanstack/${framework}-start/ssr-rpc`,
    serverRpc: `@tanstack/${framework}-start/server-rpc`,
  }
}

let specifierPattern: RegExp | null = null

/** A call of a builder's method that takes server code. */
const SERVER_CODE_CALL_RE = /\.\s*(?:handler|server|client|validator|inputValidator)\s*\(/

/**
 * Whether the JavaScript of a late-pass module (`.mdx`, `.vue`, …) may use a
 * Start value: it names a Start package, or calls a builder's method on what
 * it imports from another module of the app.
 */
export function lateModuleUsesStart(code: string): boolean {
  return namesStartSpecifier(code) || SERVER_CODE_CALL_RE.test(code)
}

/**
 * Whether a module's text names a package of the recognizer table (a Start
 * or router package): the cheap gate of a module the compiler must never
 * leave untransformed. Over-inclusive on purpose (a subpath or a string
 * mentioning the package counts).
 */
export function namesStartSpecifier(code: string): boolean {
  specifierPattern ??= new RegExp(
    Object.keys(startRecognizer().factories)
      .map((spec) => spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
      .join('|'),
  )
  return specifierPattern.test(code)
}
