import path from 'node:path'
import { normalizePath } from 'vite'
import { debug } from '../debug'
import type { Config } from '@tanstack/router-generator'
import type { Plugin } from 'vite'

export const moduleId = 'tanstack-start-route-tree:v'

export function virtualRouteTreePlugin(config: Config): Plugin {
  const generatedRouteTreePath = normalizePath(
    path.resolve(config.generatedRouteTree),
  )

  return {
    name: 'tanstack-start:virtual-route-tree',
    enforce: 'pre',
    sharedDuringBuild: true,
    resolveId: {
      filter: { id: new RegExp(moduleId) },
      handler(id) {
        let resolvedId: string | null = null
        if (id === moduleId) {
          if (debug) console.info('resolving id', id, generatedRouteTreePath)
          resolvedId = generatedRouteTreePath
        }
        return resolvedId
      },
    },
  }
}
