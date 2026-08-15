import { describe, expect, it } from 'vitest'
import {
  createBunVirtualModuleStore,
  isBunVirtualModuleId,
  VIRTUAL_MODULES,
} from '../src/bun/virtual-modules'
import type { NormalizedClientBuild } from '../src/types'
import type { ServerFn } from '../src/start-compiler/types'

describe('isBunVirtualModuleId', () => {
  it('matches reserved virtual ids only', () => {
    expect(isBunVirtualModuleId(VIRTUAL_MODULES.startManifest)).toBe(true)
    expect(isBunVirtualModuleId(VIRTUAL_MODULES.serverFnResolver)).toBe(true)
    expect(isBunVirtualModuleId('virtual:tanstack-start-client-entry')).toBe(
      true,
    )
    expect(isBunVirtualModuleId('#tanstack-router-entry')).toBe(true)
    expect(
      isBunVirtualModuleId('tanstack-start-import-protection:mock'),
    ).toBe(false)
    expect(isBunVirtualModuleId('tanstack-start-example-basic')).toBe(false)
  })
})

describe('createBunVirtualModuleStore', () => {
  it('writes serverFn resolver module from registry', () => {
    const store = createBunVirtualModuleStore()
    const serverFnsById: Record<string, ServerFn> = {
      abc123: {
        functionName: 'getMessage',
        functionId: 'abc123',
        filename: '/app/src/routes/index.tsx',
        extractedFilename: '/app/src/routes/index.tsx?tss-serverfn-split',
      },
    }

    store.updateServerFnResolver(serverFnsById, {
      includeClientReferencedCheck: false,
    })

    const code = store.get(VIRTUAL_MODULES.serverFnResolver)
    expect(code).toBeTruthy()
    expect(code).toContain('getServerFnById')
    expect(code).toContain('abc123')
  })

  it('writes start manifest from NormalizedClientBuild', () => {
    const store = createBunVirtualModuleStore()
    const clientBuild: NormalizedClientBuild = {
      entryChunkFileName: 'assets/client.js',
      chunksByFileName: new Map([
        [
          'assets/client.js',
          {
            fileName: 'assets/client.js',
            isEntry: true,
            imports: [],
            dynamicImports: [],
            css: [],
            routeFilePaths: [],
            hydrationIds: [],
          },
        ],
      ]),
      chunkFileNamesByRouteFilePath: new Map(),
      cssFilesBySourcePath: new Map(),
    }

    store.updateManifest({
      clientBuild,
      publicBase: '/',
      scriptFormat: 'module',
    })

    const code = store.get(VIRTUAL_MODULES.startManifest)
    expect(code).toContain('tsrStartManifest')
    expect(code).toContain('assets/client.js')
  })
})
