import {
  loadMockEdgeModule,
  loadMockRuntimeModule,
  loadSilentMockModule,
} from '../import-protection/virtualModules'
import type { Rspack } from '@rsbuild/core'

const mockLoader: Rspack.LoaderDefinition = function () {
  const query = new URLSearchParams(this.resourceQuery.slice(1))
  const kind = query.get('tanstack-start-mock')
  if (kind === 'silent') {
    return loadSilentMockModule().code
  }
  const payload = query.get('payload')
  if (payload) {
    if (kind === 'edge') {
      return loadMockEdgeModule(payload).code
    }
    if (kind === 'runtime') {
      return loadMockRuntimeModule(payload).code
    }
  }
  throw new Error('Invalid import-protection mock request')
}

export default mockLoader
