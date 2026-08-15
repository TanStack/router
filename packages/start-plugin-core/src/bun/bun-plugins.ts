import type { BunPlugin } from 'bun'
import { ENTRY_POINTS } from '../constants'
import { EMPTY_SERIALIZATION_ADAPTERS_MODULE } from '../serialization-adapters-module'
import {
  isBunVirtualModuleId,
  VIRTUAL_MODULES,
} from './virtual-modules'
import type { BunResolvedEntryAliases } from './planning'
import type { BunVirtualModuleStore } from './virtual-modules'

const ALIAS_FILTER = new RegExp(
  `^(${[
    ENTRY_POINTS.client,
    ENTRY_POINTS.server,
    ENTRY_POINTS.start,
    ENTRY_POINTS.router,
    VIRTUAL_MODULES.serverFnResolver,
    VIRTUAL_MODULES.startManifest,
    VIRTUAL_MODULES.pluginAdapters,
  ]
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')}|virtual:tanstack-|tanstack-start-)`,
)

/** Resolve entry aliases and virtual modules before filesystem lookup. */
export function createBunAliasAndVirtualPlugin(opts: {
  aliases: BunResolvedEntryAliases['alias']
  virtualModules: BunVirtualModuleStore
}): BunPlugin {
  const aliasEntries = Object.entries(opts.aliases)

  return {
    name: 'tanstack-start-bun-aliases',
    setup(build) {
      // IMPORTANT: do not use filter /.*/ — Bun can drop package imports when a
      // catch-all onResolve participates in packages:'bundle' builds.
      build.onResolve({ filter: ALIAS_FILTER }, (args) => {
        for (const [id, target] of aliasEntries) {
          if (args.path === id) {
            return { path: target }
          }
        }

        if (
          args.path === VIRTUAL_MODULES.serverFnResolver ||
          args.path === VIRTUAL_MODULES.startManifest ||
          args.path === VIRTUAL_MODULES.pluginAdapters ||
          isBunVirtualModuleId(args.path)
        ) {
          return {
            path: args.path,
            namespace: 'tanstack-virtual',
          }
        }

        return undefined
      })

      build.onLoad({ filter: /.*/, namespace: 'tanstack-virtual' }, (args) => {
        if (args.path === VIRTUAL_MODULES.pluginAdapters) {
          return {
            contents:
              opts.virtualModules.get(VIRTUAL_MODULES.pluginAdapters) ??
              `export const hasPluginAdapters = false
export const pluginSerializationAdapters = []
export const adapters = []
export default adapters
`,
            loader: 'js',
          }
        }

        const contents = opts.virtualModules.get(args.path)
        if (contents === undefined) {
          if (args.path === VIRTUAL_MODULES.serverFnResolver) {
            return {
              contents: `export async function getServerFnById() { throw new Error('Server function resolver not ready') }`,
              loader: 'js',
            }
          }
          if (args.path === VIRTUAL_MODULES.startManifest) {
            return {
              contents: `export const tsrStartManifest = () => ({ routes: {} })`,
              loader: 'js',
            }
          }
          return {
            contents: 'export {}',
            loader: 'js',
          }
        }

        return { contents, loader: 'js' }
      })
    },
  }
}

export { ENTRY_POINTS }
