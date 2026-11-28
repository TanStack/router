/**
 * The server-function modules of the Vite host: the dev lookup (J4.2 in
 * development), a caller environment's forward to the provider, and the
 * resolver (`getServerFnById`) of each resolver environment.
 */
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { identify, normalizePath } from '@tanstack/router-utils/compiler'
import { isFileLoadingAllowed } from 'vite'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { decodeDevFunctionId } from '../server-fns/ids'
import { providerModuleId } from '../server-fns/registry'
import {
  SERVER_FN_LOOKUP_VIRTUAL_ID,
  callerGateModule,
  devLookupModule,
  devResolverModule,
  resolverManifest,
  unknownServerFnMessage,
  unreferencedWarning,
} from '../server-fns/resolver'
import { createVirtualModule, resolvedVirtualId } from './createVirtualModule'
import { outputOnDisk } from './compiler-state'
import type { PackageClasses } from '../compiler/package-class'
import type { Environment, Plugin } from 'vite'
import type { ClientBuildRecord, ViteCompilerState } from './compiler-state'
import type { ServerFnEntry } from '../server-fns/registry'

/** A caller environment's forward to the provider's resolver (behind the production gate, J4.2). */
const SERVER_FN_FORWARD_VIRTUAL_ID = 'virtual:tanstack-start-server-fn-forward'

/** The specifier of a module id for the dev module runner: root-relative, or `/@fs/` for files outside the root. */
function toDevSpecifier(id: string, root: string): string {
  const normalizedRoot = normalizePath(root).replace(/\/$/, '')
  const normalized = normalizePath(id)
  if (normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized.slice(normalizedRoot.length)
  }
  return normalized.startsWith('/') ? `/@fs${normalized}` : `/@fs/${normalized}`
}

type EnvironmentConfig = Environment['config']

/**
 * Whether Vite's dev server may serve `file` (`server.fs`, the check of a
 * `/@fs/` request, on the path and on the path without its query, as Vite
 * does; `config`: the client environment's, which answers those requests).
 * A server environment's own requests skip that check.
 */
function servable(config: EnvironmentConfig, file: string): boolean {
  return (
    isFileLoadingAllowed(config, file) &&
    isFileLoadingAllowed(config, file.replace(/[?#].*$/s, ''))
  )
}

/**
 * The file an id the registry does not hold names, if the dev lookup may
 * compile it on request (SPEC J4.4): with symlinks resolved, inside the
 * app's `srcDirectory` and in no `node_modules` directory below it, and one
 * Vite's dev server may serve (`servable`, the named path and the real one).
 * Null otherwise: then only the ids a compile of the session registered
 * answer.
 */
async function compilableOnRequest(
  config: EnvironmentConfig,
  named: string,
  srcDirectory: string,
): Promise<string | null> {
  const [file, src] = await Promise.all([
    realpath(named),
    realpath(srcDirectory),
  ]).catch(() => [null, null])
  if (!file || !src) {
    return null
  }
  const rel = path.relative(src, file)
  const segments = rel.split(/[\\/]/)
  if (
    rel === '' ||
    path.isAbsolute(rel) ||
    segments[0] === '..' ||
    segments.includes('node_modules')
  ) {
    return null
  }
  const real = normalizePath(file)
  return servable(config, named) && servable(config, real) ? real : null
}

/**
 * J4.2 in development: a client-origin call of a function whose defining
 * module the client environment has not compiled (no client module in the
 * dev server's graph references it: a stale page after a restart, an
 * external caller, a serialized function) is answered, with one warning
 * per function saying a production build refuses it if no client code
 * calls it. The dev server compiles lazily, so nothing short of crawling
 * the client graph could prove reachability; it is not attempted, and the
 * warning is only a hint: a private helper of a module the client compiled
 * is answered without one, though production refuses it. An id is the caller's and may
 * name any file: the file of an id the registry does not hold (the ids a
 * compile of this dev session reported) is compiled only when it is an app
 * source (`compilableOnRequest`: in `srcDirectory`, outside `node_modules`,
 * servable), so a page left open across a restart keeps working; any other
 * unregistered id is refused.
 */
export function devLookupPlugin(state: ViteCompilerState): Plugin {
  const lookupPrefix = `\0${SERVER_FN_LOOKUP_VIRTUAL_ID}?`
  return {
    name: 'tanstack-start:server-fn-lookup',
    apply: 'serve',
    applyToEnvironment(e) {
      return state.resolverEnvironments.has(e.name)
    },
    resolveId(source) {
      if (source.startsWith(`${SERVER_FN_LOOKUP_VIRTUAL_ID}?`)) {
        return `\0${source}`
      }
      return undefined
    },
    async load(id) {
      if (!id.startsWith(lookupPrefix)) {
        return undefined
      }
      const s = state.sessionOf(this.environment)
      const { registry, opts: startOpts } = s.start
      const params = new URLSearchParams(id.slice(lookupPrefix.length))
      const fnId = params.get('id') ?? ''
      let entry = registry.get(fnId)
      const key = !entry && decodeDevFunctionId(fnId)
      if (key && this.environment.mode === 'dev') {
        // a fresh server: compile an app source's defining module through
        // the normal transform (a dev session has its server)
        const file = await compilableOnRequest(
          s.server!.environments[VITE_ENVIRONMENT_NAMES.client].config,
          normalizePath(path.resolve(startOpts.root, key.rootRel)),
          startOpts.srcDirectory,
        )
        if (file) {
          await this.environment.transformRequest(file).catch(() => null)
          entry = registry.get(fnId)
        }
      }
      if (!entry) {
        this.error(unknownServerFnMessage(fnId))
      }
      if (
        params.get('origin') === 'client' &&
        !entry.clientReferenced &&
        !s.devWarned.has(fnId)
      ) {
        s.devWarned.add(fnId)
        this.warn(unreferencedWarning(entry))
      }
      const specifier = toDevSpecifier(providerModuleId(entry), startOpts.root)
      return devLookupModule(entry, specifier)
    },
  }
}

/** A caller environment's own `getServerFnById` module (the forward to the provider), behind the production gate. */
export function forwardPlugin(state: ViteCompilerState): Plugin {
  return createVirtualModule({
    name: 'tanstack-start:server-fn-forward',
    moduleId: SERVER_FN_FORWARD_VIRTUAL_ID,
    enforce: 'pre',
    applyToEnvironment: (e) =>
      state.resolverEnvironments.has(e.name) &&
      e.name !== state.opts.providerEnvName,
    load() {
      return state.envOf(this.environment.name)?.getServerFnById ?? null
    },
  })
}

/**
 * The functions the client's emitted code calls (`callable`) that the
 * separate provider's resolver did not list (`listed`, null: no provider
 * build wrote one): a click answers "Server function info not found". The
 * provider builds before the client, from the server fns its own graph and
 * the early compile of their reach found (J4.2; KNOWN-BUGS: server fns only
 * client-only code or a lazy import below a `'use client'` module imports,
 * and those of an installed package). The build fails naming them: the
 * comparison is a fact of the emitted output; why the provider missed a
 * function is not known here, so the causes are given as possible ones.
 */
function callableNotProvided(
  clientBuild: ClientBuildRecord | null,
  listed: ReadonlySet<string> | null,
): Array<ServerFnEntry> {
  if (!clientBuild || !listed) {
    return []
  }
  return [...clientBuild.referenced.values()].filter(
    (e) => clientBuild.callable.has(e.id) && !listed.has(e.id),
  )
}

/**
 * The build error for `missing` (`callableNotProvided`), with the ways out
 * that apply to its files: a module of the app, or of a package that
 * declares Start, is registered when a server fn's handler uses it (its raw
 * reach is compiled early); a module of another installed package is not
 * (that walk does not enter it, and Vite keeps the package external on the
 * server): the package must declare Start. A package that declares Start
 * is missing when its export conditions give the browser another file
 * than the server, each defining the function (node_modules policy,
 * decision 13).
 */
function callableNotProvidedError(
  missing: Array<ServerFnEntry>,
  classes: Pick<PackageClasses, 'classOf'>,
): string {
  const classOf = (e: ServerFnEntry) =>
    classes.classOf(identify(e.definingCanonicalId).path)
  const installed = (e: ServerFnEntry) => classOf(e) === 'package'
  const lines = [
    `[tanstack-start] The client build calls server functions that the RSC environment's server function resolver does not list: each call would answer "Server function info not found".`,
    ...missing.map((e) => `  - ${e.name} of ${e.rootRel}`),
    `The RSC environment builds before the client and lists the server functions of the server code it compiled. Possible causes: only client-only code (a <ClientOnly> child, a createClientOnlyFn body, a <Hydrate> fallback) or a lazy import() in or below a 'use client' module imports the file; or the file is in an installed package that does not declare Start, which only client code or server function handlers import; or a package's export conditions give the browser a file of its own that defines the function.`,
  ]
  if (missing.some((e) => classOf(e) === 'app' || classOf(e) === 'workspace')) {
    lines.push(
      `For a file of the app: import the server function in a server function's module as well, and use it in that function's handler.`,
    )
  }
  if (missing.some(installed)) {
    lines.push(
      `For a file of an installed package: the package must declare TanStack Start (@tanstack/react-start in its peerDependencies), so that Start bundles its modules for the server and reads them.`,
    )
  }
  if (missing.some((e) => classOf(e) === 'start-package')) {
    lines.push(
      `For a file of an installed package that declares TanStack Start: the package's export conditions may give the browser another file than the server; each server function must be defined in one module that every condition re-exports.`,
    )
  }
  return lines.join('\n')
}

/** The `meta` key of what a separate provider's resolver module lists (`providerListPlugin`). */
const PROVIDER_LIST_META = 'tanstack-start:provider-list'

/**
 * A separate provider's list (RSC, `Session.providerListed`) follows its
 * output on disk, as the client-build record does (`outputOnDisk`): none
 * when a build that writes or empties the directory starts rendering (Vite
 * empties it then), the ids the resolver module of the bundle lists (its
 * `meta`, set by its `load`) once the build is written, or generated when it
 * leaves the directory unchanged. A bundle without the resolver module lists
 * none.
 */
export function providerListPlugin(state: ViteCompilerState): Plugin {
  const resolverId = resolvedVirtualId(VIRTUAL_MODULES.serverFnResolver)
  const commit = (ctx: {
    environment: Environment
    getModuleInfo: (id: string) => { meta: Record<string, unknown> } | null
  }) => {
    const listed = ctx.getModuleInfo(resolverId)?.meta[PROVIDER_LIST_META]
    state.sessionOf(ctx.environment).providerListed = Array.isArray(listed)
      ? new Set<string>(listed)
      : null
  }
  return {
    name: 'tanstack-start:server-fn-provider-list',
    enforce: 'pre',
    applyToEnvironment: (e) =>
      !state.ssrIsProvider && e.name === state.opts.providerEnvName,
    renderStart: {
      order: 'pre',
      handler() {
        if (
          outputOnDisk(this.environment, this.meta.watchMode) !== 'unchanged'
        ) {
          state.sessionOf(this.environment).providerListed = null
        }
      },
    },
    generateBundle: {
      order: 'post',
      handler() {
        if (
          this.environment.mode === 'build' &&
          outputOnDisk(this.environment, this.meta.watchMode) === 'unchanged'
        ) {
          commit(this)
        }
      },
    },
    writeBundle: {
      order: 'pre',
      handler() {
        if (outputOnDisk(this.environment, this.meta.watchMode) === 'written') {
          commit(this)
        }
      },
    },
  }
}

/** Each resolver environment's `getServerFnById` module (`VIRTUAL_MODULES.serverFnResolver`). */
export function resolverPlugin(state: ViteCompilerState): Plugin {
  return createVirtualModule({
    name: 'tanstack-start:server-fn-resolver',
    moduleId: VIRTUAL_MODULES.serverFnResolver,
    enforce: 'pre',
    applyToEnvironment: (e) => state.resolverEnvironments.has(e.name),
    async load() {
      const s = state.sessionOf(this.environment)
      // the functions the client build references and those it calls (J4.2,
      // R182), as the client's last build of the run left them
      const clientBuild =
        this.environment.mode === 'build'
          ? await state.embedClientBuild(this)
          : null
      if (
        this.environment.mode === 'build' &&
        this.environment.name === VITE_ENVIRONMENT_NAMES.server &&
        // (not a scan: plugin-rsc analyses the ssr environment first)
        this.environment.config.build.write !== false &&
        clientBuild === null &&
        // (`build --watch`: the client's first build failed; its first
        // build rebuilds the server, which answers no client call meanwhile)
        !this.meta.watchMode
      ) {
        // the server would answer no client call (J4.2)
        this.error(
          `[tanstack-start] The server environment is built before the client environment. The server answers the server functions the client build calls, so the client must build first, in the same process: run \`vite build\`, or build \`builder.environments.client\` before \`builder.environments.ssr\`.`,
        )
      }
      const callableIds = [...(clientBuild?.callable ?? [])].sort()
      if (this.environment.name !== state.opts.providerEnvName) {
        const mod = state.envOf(this.environment.name)?.getServerFnById
        if (mod) {
          if (this.environment.mode === 'build' && !state.ssrIsProvider) {
            // J4.2 with a separate provider (RSC): the provider built before
            // the client, so its manifest lists every function; this
            // environment builds last (plugin-rsc: rsc, client, ssr) and
            // gates client-origin calls on the functions the client calls
            const missing = callableNotProvided(clientBuild, s.providerListed)
            if (missing.length > 0) {
              this.error(callableNotProvidedError(missing, s.start.classes))
            }
            return callerGateModule(SERVER_FN_FORWARD_VIRTUAL_ID, callableIds)
          }
          return mod
        }
        this.error(
          `No getServerFnById implementation found for caller environment: ${this.environment.name}`,
        )
      }
      if (this.environment.mode !== 'build') {
        return devResolverModule()
      }
      if (!state.ssrIsProvider) {
        // the RSC provider builds before the client: every function; what
        // the module lists, the provider list once the build that bundles
        // it is written (`providerListPlugin`)
        const entries = s.start.registry.entries()
        return {
          code: resolverManifest(entries, { kind: 'provider-first' }),
          meta: { [PROVIDER_LIST_META]: entries.map((e) => e.id) },
        }
      }
      // the SSR provider builds after the client: the functions the client
      // build on disk references, each the server environment's own
      // declaration where it has one (its build provides it), else as that
      // client build left it
      const entries = [...(clientBuild?.referenced.values() ?? [])].map((e) => {
        const own = s.start.registry.get(e.id)
        return own?.serverDeclared ? { ...own, clientReferenced: true } : e
      })
      return resolverManifest(entries, {
        kind: 'client-gated',
        callable: clientBuild?.callable ?? new Set(),
      })
    },
  })
}
