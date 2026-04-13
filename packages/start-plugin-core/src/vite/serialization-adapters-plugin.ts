import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import {
  EMPTY_SERIALIZATION_ADAPTERS_MODULE,
  generateSerializationAdaptersModule,
} from '../serialization-adapters-module'
import { START_ENVIRONMENT_NAMES } from '../constants'
import { createVirtualModule } from './createVirtualModule'
import type { SerializationAdapterConfig } from '../types'
import type { PluginOption } from 'vite'

export function serializationAdaptersPlugin(opts: {
  adapters: Array<SerializationAdapterConfig> | undefined
}): PluginOption {
  return createVirtualModule({
    name: 'tanstack-start:plugin-adapters',
    moduleId: VIRTUAL_MODULES.pluginAdapters,
    enforce: 'pre',
    load() {
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
  })
}
