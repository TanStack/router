/**
 * The server-function modules of the Vite host: the dev lookup (J4.2 in
 * development), a caller environment's forward to the provider, and the
 * resolver (`getServerFnById`) of each resolver environment.
 */
import path from 'node:path'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { normalizePath } from '@tanstack/router-utils/compiler'
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
import type { Plugin } from 'vite'
import type { ViteCompilerState } from './compiler-state'

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
 * J4.2 in development: a client-origin call of a function whose defining
 * module the client environment has not compiled (no client module in the
 * dev server's graph references it: a stale page after a restart, an
 * external caller, a serialized function) is answered, with one warning
 * per function saying a production build refuses it. The dev server
 * compiles lazily, so nothing short of crawling the client graph could
 * prove reachability; it is not attempted.
 */
export function devLookupPlugin(state: ViteCompilerState): Plugin {
  const lookupPrefix = `\0${SERVER_FN_LOOKUP_VIRTUAL_ID}?`
  const devWarned = new Set<string>()
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
      const { registry, opts: startOpts } = state.requireSession().start
      const params = new URLSearchParams(id.slice(lookupPrefix.length))
      const fnId = params.get('id') ?? ''
      let entry = registry.get(fnId)
      if (!entry) {
        // a fresh server: compile the defining module through the normal transform
        const key = decodeDevFunctionId(fnId)
        if (key && this.environment.mode === 'dev') {
          const abs = path.resolve(startOpts.root, key.rootRel)
          await this.environment.transformRequest(abs).catch(() => null)
          entry = registry.get(fnId)
        }
      }
      if (!entry) {
        this.error(`Invalid server function ID: ${fnId}`)
      }
      if (
        params.get('origin') === 'client' &&
        !entry.clientReferenced &&
        !devWarned.has(fnId)
      ) {
        devWarned.add(fnId)
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
      if (
        this.environment.mode === 'build' &&
        this.environment.name === VITE_ENVIRONMENT_NAMES.server &&
        // (not a scan: plugin-rsc analyses the ssr environment first)
        this.environment.config.build.write !== false &&
        state.clientFiles === null
      ) {
        // the server would answer no client call (J4.2)
        this.error(
          `[tanstack-start] The server environment is built before the client environment. The server answers the server functions the client build calls, so the client must build first, in the same process: run \`vite build\`, or build \`builder.environments.client\` before \`builder.environments.ssr\`.`,
        )
      }
      if (this.environment.mode === 'build' && this.meta.watchMode) {
        await state.clientRebuild?.ended
        for (const file of state.clientFiles ?? []) {
          this.addWatchFile(file)
        }
      }
      if (this.environment.name !== state.opts.providerEnvName) {
        const mod = state.envOf(this.environment.name)?.getServerFnById
        if (mod) {
          if (this.environment.mode === 'build' && !state.ssrIsProvider) {
            // J4.2 with a separate provider (RSC): the provider built before
            // the client, so its manifest lists every function; this
            // environment builds last (plugin-rsc: rsc, client, ssr) and
            // gates client-origin calls on the client build's references
            return callerGateModule(
              SERVER_FN_FORWARD_VIRTUAL_ID,
              state
                .requireSession()
                .start.registry.entries()
                .filter((e) => e.clientReferenced)
                .map((e) => e.id),
            )
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
        entries: state.requireSession().start.registry.entries(),
        providerModuleId,
        clientReferencedOnly: state.ssrIsProvider,
      })
    },
  })
}
