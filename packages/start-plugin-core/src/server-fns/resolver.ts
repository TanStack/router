/**
 * The server-function resolver modules (J4.2): in development a lookup by
 * id through a per-id virtual module that re-exports the provider's
 * `createServerRpc` wrapper from the defining module (compiled through the
 * normal transform, also on a fresh server when it is an app source); in
 * production a manifest of the functions server code may call by id,
 * importing each provider module, whose client-origin (HTTP) calls are
 * gated to the functions the client's emitted code calls (R182). Rsbuild uses the manifest in both modes
 * (`manifestResolverModule`): its bundles hold every provider module.
 */
import { manifestLiteral } from './format'
import { providerModuleId } from './registry'
import type { ServerFnEntry } from './registry'

export const SERVER_FN_LOOKUP_VIRTUAL_ID =
  'virtual:tanstack-start-server-fn-lookup'

/**
 * The text of a call by an id the server has no function of, or none the
 * caller may call (the two read the same), on every host and in every mode:
 * the error the generated resolvers throw, before and after the id.
 */
const UNKNOWN_ID = [
  'Server function info not found for ',
  '. If the page loaded before the server changed, reload it.',
] as const

/** The message of a call by an unknown id (`UNKNOWN_ID`). */
export function unknownServerFnMessage(id: string): string {
  return `${UNKNOWN_ID[0]}${id}${UNKNOWN_ID[1]}`
}

/** The statement of a generated resolver that throws it for its `id`. */
const THROW_UNKNOWN_ID = `throw new Error(${JSON.stringify(UNKNOWN_ID[0])} + id + ${JSON.stringify(UNKNOWN_ID[1])})`

/**
 * The dev resolver: every call imports the lookup module of the id (never
 * memoised: handlers are hot-replaced). A client-origin call (an HTTP
 * request) imports the lookup under `origin=client`: the lookup warns once
 * for a function no client module the dev server has compiled so far
 * references (J4.2 in development: the dev server compiles lazily, so it
 * cannot know every client reference; the warning is a hint, not
 * production's check: a private helper of a compiled client module gets
 * none, though production refuses it).
 */
export function devResolverModule(): string {
  return `
export async function getServerFnById(id, access) {
  const lookup = ${JSON.stringify(`/@id/__x00__${SERVER_FN_LOOKUP_VIRTUAL_ID}`)} + '?id=' + encodeURIComponent(id) + (access && access.origin === 'client' ? '&origin=client' : '')
  const mod = await import(/* @vite-ignore */ lookup)
  // a lookup loaded before an edit removed its server fn re-exports nothing
  if (!mod.action) {
    ${THROW_UNKNOWN_ID}
  }
  return mod.action
}
`
}

/** The development warning of a client call of a function no client module references. */
export function unreferencedWarning(entry: ServerFnEntry): string {
  return `[tanstack-start] The server function ${entry.name} of ${entry.rootRel} was called from the client, but no client module this dev server has compiled so far references it. If no client code calls it, a production build refuses this call: only server functions the client bundle calls are callable over HTTP.`
}

/**
 * The dev lookup module of one id: a re-export of the provider wrapper. It
 * accepts its own hot updates: the registry's module (the lazy module, R158
 * rule 3) accepts none, and an edit reaching the lookup through it ends
 * there instead of fully reloading the server (the resolver imports the
 * lookup again at the next call).
 */
export function devLookupModule(
  entry: ServerFnEntry,
  specifier: string,
): string {
  return `export { ${entry.exportName} as action } from ${JSON.stringify(specifier)}
if (import.meta.hot) {
  import.meta.hot.accept(() => {})
}
`
}

interface ManifestResolverOptions {
  entries: ReadonlyArray<ServerFnEntry>
  /** The provider module id of an entry (the original module or its derived provider id). */
  providerModuleId: (entry: ServerFnEntry) => string
  /**
   * Development: every function is listed; a client-origin call of a
   * function no client module the dev server has compiled so far references
   * is answered, with one warning per function naming it and saying a
   * production build refuses it if no client code calls it (a stale page
   * after a restart, an external caller, a serialized function). A hint, not
   * production's check: a private helper of a compiled client module is
   * answered without one.
   */
  warnUnreferenced?: boolean
  /** Import every provider module statically (Rsbuild RSC development). */
  staticImports?: boolean
  /** Keep each imported module on its manifest entry after the first call (production only: modules are never hot-replaced). */
  memoizeModules?: boolean
  /**
   * Production: a client-origin call (an HTTP request) of a function not in
   * this set is refused (J4.2, R182): the functions whose client call
   * survives in the client's emitted code. Server-origin calls reach every
   * listed function. A JSON array literal of those ids.
   */
  clientOriginGate?: string
}

/**
 * What a resolver's manifest lists, and how it gates, for each kind of
 * build (J4.2, R182): the one rule of every host.
 * - `client-gated`: a production build whose SSR environment is the
 *   provider (it builds after the client): the functions a client compile
 *   stubbed (server code calls them by id too: a split route chunk's
 *   `createSsrRpc`), client-origin calls gated to `callable`.
 * - `provider-first`: a separate provider (Vite RSC) building before the
 *   client: every function (server-origin calls need them all); the
 *   caller environment gates (`callerGateModule`).
 * - `provider-gated`: a separate provider whose resolver is built again
 *   once the client built (Rsbuild RSC): the functions a server compile
 *   declares and those the client's emitted code calls (`callable`, null
 *   before the client's first build), gated to them. A function only a
 *   client compile stubbed, whose stub the bundler dropped, is not listed:
 *   its provider and what the provider imports are not built.
 * - `dev`: development's manifest (Rsbuild): every function, imported
 *   statically with a separate provider (RSC), else warning once for a
 *   client call of one no client module references.
 */
export type ResolverShape =
  | { kind: 'client-gated'; callable: ReadonlySet<string> }
  | { kind: 'provider-first' }
  | { kind: 'provider-gated'; callable: ReadonlySet<string> | null }
  | { kind: 'dev'; separateProvider: boolean }

/**
 * The manifest resolver module of `entries` for a build of `shape`: `id →
 * { functionName, importer, exportName }` of the functions server code may
 * call by id. `functionName` is what earlier Start versions printed there
 * (tooling reads it from the server bundle); the lookup reads the provider
 * module's export, `exportName`, which is unique per file.
 */
export function resolverManifest(
  entries: ReadonlyArray<ServerFnEntry>,
  shape: ResolverShape,
): string {
  const gate = (callable: ReadonlySet<string> | null) =>
    JSON.stringify([...(callable ?? [])].sort())
  switch (shape.kind) {
    case 'client-gated':
      return manifestResolverModule({
        entries: entries.filter((e) => e.clientReferenced),
        providerModuleId,
        memoizeModules: true,
        clientOriginGate: gate(shape.callable),
      })
    case 'provider-first':
      return manifestResolverModule({
        entries,
        providerModuleId,
        memoizeModules: true,
      })
    case 'provider-gated':
      return manifestResolverModule({
        entries: entries.filter(
          (e) => e.serverDeclared || shape.callable?.has(e.id),
        ),
        providerModuleId,
        memoizeModules: true,
        clientOriginGate: gate(shape.callable),
      })
    case 'dev':
      return manifestResolverModule({
        entries,
        providerModuleId,
        warnUnreferenced: !shape.separateProvider,
        staticImports: shape.separateProvider,
      })
  }
}

/** A manifest resolver module of `entries` (`resolverManifest`). */
function manifestResolverModule(opts: ManifestResolverOptions): string {
  const entries = [...opts.entries]
    // stable output for content-addressed caches
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const staticImports: Array<string> = []
  const manifest = entries
    .map((e, index) => {
      const moduleRef = `serverFnModule${index}`
      const filename = JSON.stringify(
        registrySpecifier(opts.providerModuleId(e)),
      )
      if (opts.staticImports) {
        staticImports.push(`import * as ${moduleRef} from ${filename}`)
      }
      const moduleAccess = opts.staticImports
        ? `module: ${moduleRef}`
        : `importer: () => import(${filename})`
      const unreferenced =
        opts.warnUnreferenced && !e.clientReferenced
          ? `,\n    unreferenced: ${JSON.stringify(unreferencedWarning(e))}`
          : ''
      // main's entry (key, `functionName`, `importer`) stays a byte-identical prefix
      return `${manifestLiteral(e.id)}: {
    functionName: ${manifestLiteral(e.functionName)},
    ${moduleAccess},
    exportName: ${manifestLiteral(e.exportName)}${unreferenced}
  }`
    })
    .join(',\n  ')
  const warnUnreferenced = opts.warnUnreferenced
    ? `
  if (access && access.origin === 'client' && serverFnInfo.unreferenced) {
    console.warn(serverFnInfo.unreferenced)
    serverFnInfo.unreferenced = undefined
  }
`
    : ''
  // Every import() goes through the ESM loader; a resolved production module
  // can be kept on the manifest entry instead.
  const resolveModule = opts.memoizeModules
    ? 'serverFnInfo.module ??= await serverFnInfo.importer()'
    : 'serverFnInfo.module ?? (await serverFnInfo.importer())'
  const gate = opts.clientOriginGate
    ? `\nconst clientCallable = new Set(${opts.clientOriginGate})`
    : ''
  const gated = opts.clientOriginGate
    ? ` || (access && access.origin === 'client' && !clientCallable.has(id))`
    : ''
  return `
${staticImports.join('\n')}
const manifest = {
  ${manifest}
}${gate}

export async function getServerFnById(id, access) {
  const serverFnInfo = manifest[id]
  if (!serverFnInfo${gated}) {
    ${THROW_UNKNOWN_ID}
  }
${warnUnreferenced}
  const fnModule = ${resolveModule}
  if (!fnModule) {
    throw new Error('Server function module not resolved for ' + id)
  }
  const action = fnModule[serverFnInfo.exportName]
  if (!action) {
    throw new Error('Server function module export not resolved for serverFn ID: ' + id)
  }
  return action
}

`
}

/**
 * The specifier the resolver imports a registry module by (an absolute id,
 * a file's derived module with its query): a `#` of the path (`C#`,
 * `project #2`) escaped as `\0#`, as `sameFileSpecifier` prints a file's
 * own derived modules: webpack and Rspack resolve the escape, the Vite host
 * resolves it for the resolver module (`resolveRegistrySpecifier`).
 */
export function registrySpecifier(id: string): string {
  return id.replace(/#/g, '\0#')
}

/** The id a `registrySpecifier` names (the Vite host, for the resolver module's imports). */
export function resolveRegistrySpecifier(specifier: string): string {
  return specifier.replace(/\0#/g, '#')
}

/**
 * The caller environment's resolver of a separate provider's production
 * build (J4.2, Vite RSC): the provider built before the client, so its
 * manifest lists every function (server-origin calls need them all); this
 * environment builds after the client and refuses a client-origin call of
 * a function the client's emitted code does not call (R182), then forwards to the provider's
 * `getServerFnById` (the module `forwardSpecifier` exports).
 */
export function callerGateModule(
  forwardSpecifier: string,
  callableIds: ReadonlyArray<string>,
): string {
  const ids = [...callableIds].sort()
  return `import { getServerFnById as forward } from ${JSON.stringify(forwardSpecifier)}
const clientCallable = new Set(${JSON.stringify(ids)})
export async function getServerFnById(id, access) {
  if (access && access.origin === 'client' && !clientCallable.has(id)) {
    ${THROW_UNKNOWN_ID}
  }
  return forward(id, access)
}
`
}

/** A function of a manifest resolver module (`manifestFunctionsDiffering`). */
export interface ManifestFunction {
  /** Its `functionName` entry, as printed. */
  functionName: string
  /** The id of the module that provides it (`providerModuleId`). */
  provider: string
}

/**
 * The functions only one of two manifest resolver modules lists
 * (`manifestResolverModule`'s content), by manifest identity: the entry's
 * id and its provider module (two files may export one function name).
 * In the order of `a`, then `b`: what a report of two contents names.
 */
export function manifestFunctionsDiffering(
  a: string,
  b: string,
): Array<ManifestFunction> {
  const entries = (content: string) => {
    const lines = content.split('\n').map((line) => line.trim())
    /** The static imports' specifiers (`staticImports`), by module binding. */
    const modules = new Map<string, string>()
    for (const line of lines) {
      const m = /^import \* as (\w+) from (".*")$/.exec(line)
      if (m) {
        modules.set(m[1]!, JSON.parse(m[2]!))
      }
    }
    const out = new Map<string, ManifestFunction>()
    let key: string | null = null
    let functionName = ''
    for (const line of lines) {
      if (line.endsWith(': {') && !line.startsWith('const ')) {
        key = line
        continue
      }
      if (key === null) {
        continue
      }
      if (line.startsWith('functionName:')) {
        functionName = line
          .slice('functionName:'.length)
          .trim()
          .replace(/,$/, '')
        continue
      }
      const imported = /^importer: \(\) => import\((".*")\),?$/.exec(line)
      const bound = /^module: (\w+),?$/.exec(line)
      const specifier = imported
        ? (JSON.parse(imported[1]!) as string)
        : bound
          ? modules.get(bound[1]!)
          : undefined
      if (specifier !== undefined) {
        const provider = resolveRegistrySpecifier(specifier)
        out.set(`${key}\0${provider}`, { functionName, provider })
        key = null
      }
    }
    return out
  }
  const x = entries(a)
  const y = entries(b)
  return [
    ...[...x].filter(([k]) => !y.has(k)),
    ...[...y].filter(([k]) => !x.has(k)),
  ].map(([, f]) => f)
}
