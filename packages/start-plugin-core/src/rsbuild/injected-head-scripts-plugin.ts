import { createRspackPlugin } from 'unplugin'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'

export function createInjectedHeadScriptsPlugin() {
  return createRspackPlugin(() => ({
    name: 'tanstack-start:injected-head-scripts',
    resolveId(id) {
      if (id === VIRTUAL_MODULES.injectedHeadScripts) {
        return id
      }
      return null
    },
    load(id) {
      if (id !== VIRTUAL_MODULES.injectedHeadScripts) return null
      return `export const injectedHeadScripts = undefined`
    },
  }))
}
