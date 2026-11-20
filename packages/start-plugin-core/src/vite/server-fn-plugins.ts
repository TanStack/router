/**
 * The server-function modules of the Vite host: the dev lookup (J4.2 in
 * development), a caller environment's forward to the provider, and the
 * resolver (`getServerFnById`) of each resolver environment.
 */
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { normalizePath } from '@tanstack/router-utils/compiler'
import { isFileLoadingAllowed } from 'vite'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { decodeDevFunctionId } from '../server-fns/ids'
import { providerModuleId } from '../server-fns/registry'
import {
  SERVER_FN_LOOKUP_VIRTUAL_ID,
  callerGateModule,
  devLookupModule,
  devResolverModule,
  productionResolverModule,
  unreferencedWarning,
} from '../server-fns/resolver'
import { createVirtualModule } from './createVirtualModule'
import type { Plugin, ResolvedConfig } from 'vite'
import type { ViteCompilerState } from './compiler-state'
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

/**
 * Whether Vite's dev server may serve `file` (`server.fs`, the check of a
 * `/@fs/` request, on the path and on the path without its query, as Vite
 * does). A server environment's own requests skip that check.
 */
function servable(config: ResolvedConfig, file: string): boolean {
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
  config: ResolvedConfig,
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
        // the normal transform
        const file = await compilableOnRequest(
          this.environment.getTopLevelConfig(),
          normalizePath(path.resolve(startOpts.root, key.rootRel)),
          startOpts.srcDirectory,
        )
        if (file) {
          await this.environment.transformRequest(file).catch(() => null)
          entry = registry.get(fnId)
        }
      }
      if (!entry) {
        this.error(`Invalid server function ID: ${fnId}`)
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
      const referenced = (entries: Array<ServerFnEntry>) =>
        entries.map((e) => ({
          ...e,
          clientReferenced: clientBuild?.functionIds.has(e.id) ?? false,
        }))
      const callableIds = [...(clientBuild?.publication.callable ?? [])].sort()
      if (this.environment.name !== state.opts.providerEnvName) {
        const mod = state.envOf(this.environment.name)?.getServerFnById
        if (mod) {
          if (this.environment.mode === 'build' && !state.ssrIsProvider) {
            // J4.2 with a separate provider (RSC): the provider built before
            // the client, so its manifest lists every function; this
            // environment builds last (plugin-rsc: rsc, client, ssr) and
            // gates client-origin calls on the functions the client calls
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
      return productionResolverModule({
        entries: referenced(s.start.registry.entries()),
        providerModuleId,
        clientReferencedOnly: state.ssrIsProvider,
        // the HTTP-callable functions (R182); the RSC provider builds
        // before the client, and its caller environment gates instead
        clientOriginGate: state.ssrIsProvider
          ? JSON.stringify(callableIds)
          : undefined,
      })
    },
  })
}
