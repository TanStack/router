import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import {
  EMPTY_SERIALIZATION_ADAPTERS_MODULE,
  generateSerializationAdaptersModule,
} from '../serialization-adapters-module'
import { START_ENVIRONMENT_NAMES } from '../constants'
import { resolveViteId } from '../utils'
import type { SerializationAdapterConfig } from '../types'
import type { PluginOption } from 'vite'

// Encode '#' as '%23' in the resolved ID to avoid browser treating it as URL fragment.
// The browser requests /@id/__x00__%23tanstack-start-plugin-adapters instead of
// /@id/__x00__#tanstack-start-plugin-adapters (which would truncate at #).
const resolvedModuleId = resolveViteId(
  VIRTUAL_MODULES.pluginAdapters.replace('#', '%23'),
)

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')
}

export function serializationAdaptersPlugin(opts: {
  adapters: Array<SerializationAdapterConfig> | undefined
}): PluginOption {
  return {
    name: 'tanstack-start:plugin-adapters',
    enforce: 'pre',
    resolveId: {
      filter: { id: new RegExp(escapeRegex(VIRTUAL_MODULES.pluginAdapters)) },
      handler(id: string) {
        if (id === VIRTUAL_MODULES.pluginAdapters) {
          return resolvedModuleId
        }
        return undefined
      },
    },
    load: {
      filter: {
        id: new RegExp(escapeRegex(resolvedModuleId)),
      },
      handler(this: { environment: { name: string } }, id: string) {
        if (id !== resolvedModuleId) {
          return undefined
        }

        const adapters = opts.adapters
        if (!adapters || adapters.length === 0) {
          return EMPTY_SERIALIZATION_ADAPTERS_MODULE
        }

        if (this.environment.name === START_ENVIRONMENT_NAMES.client) {
          return generateSerializationAdaptersModule({
            adapters,
            runtime: 'client',
          })
        }

        if (this.environment.name === START_ENVIRONMENT_NAMES.server) {
          return generateSerializationAdaptersModule({
            adapters,
            runtime: 'server',
          })
        }

        return EMPTY_SERIALIZATION_ADAPTERS_MODULE
      },
    },
  }
}
