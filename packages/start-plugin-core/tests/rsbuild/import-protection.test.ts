import { describe, expect, test, vi } from 'vitest'
import { compileMatchers } from '../../src/import-protection/matchers'
import {
  getRsbuildResolvedImportProtectionCheck,
  registerImportProtection,
} from '../../src/rsbuild/import-protection'

describe('getRsbuildResolvedImportProtectionCheck', () => {
  test('skips file and marker checks for excluded resolved files', () => {
    const matchers = {
      files: compileMatchers(['**/*.server.*']),
      excludeFiles: compileMatchers(['**/node_modules/**']),
    }

    expect(
      getRsbuildResolvedImportProtectionCheck(
        'node_modules/pkg/marked-server-only.ts',
        matchers,
      ),
    ).toBeUndefined()
  })

  test('classifies non-excluded denied files as file checks', () => {
    const matchers = {
      files: compileMatchers(['**/*.server.*']),
      excludeFiles: compileMatchers(['**/node_modules/**']),
    }

    const result = getRsbuildResolvedImportProtectionCheck(
      'src/secret.server.ts',
      matchers,
    )

    expect(result?.type).toBe('file')
    if (result?.type !== 'file') {
      throw new Error('Expected file import-protection check')
    }
    expect(result.fileMatch.pattern).toBe('**/*.server.*')
  })

  test('classifies non-excluded non-denied files as marker candidates', () => {
    const matchers = {
      files: compileMatchers(['**/*.server.*']),
      excludeFiles: compileMatchers(['**/node_modules/**']),
    }

    expect(
      getRsbuildResolvedImportProtectionCheck(
        'src/marked-server-only.ts',
        matchers,
      ),
    ).toEqual({ type: 'marker' })
  })
})

describe('registerImportProtection marker scope', () => {
  async function runMarkerBuild(importerFiles: Array<string>) {
    let beforeBuild: (() => void) | undefined
    let processAssetsHandler: ((context: any) => Promise<void>) | undefined
    const onViolation = vi.fn(() => false)

    registerImportProtection(
      {
        context: { action: 'build' },
        onBeforeBuild(handler: () => void) {
          beforeBuild = handler
        },
        onBeforeDevCompile() {},
        modifyRspackConfig() {},
        transform() {},
        processAssets(
          _options: unknown,
          handler: (context: any) => Promise<void>,
        ) {
          processAssetsHandler = handler
        },
      } as any,
      {
        framework: 'react',
        environments: [{ name: 'client', type: 'client' }],
        getConfig: () =>
          ({
            startConfig: {
              importProtection: {
                ignoreImporters: ['**/ignored.ts'],
                onViolation,
              },
            },
            resolvedStartConfig: {
              root: '/app',
              srcDirectory: '/app/src',
            },
          }) as any,
      },
    )

    if (!beforeBuild || !processAssetsHandler) {
      throw new Error('Expected import-protection hooks to be registered')
    }
    beforeBuild()

    const createModule = (file: string, marker = false) => ({
      buildInfo: marker
        ? {
            'tanstack.start.importProtection': {
              kind: 'server',
              source: '@tanstack/react-start/server-only',
            },
          }
        : {},
      resourceResolveData: { path: file, resource: file },
      identifier: () => file,
      originalSource: () => ({
        sourceAndMap: () => ({
          source: marker ? "import '@tanstack/react-start/server-only'" : '',
          map: null,
        }),
      }),
    })

    const markedModule = createModule('/app/src/marked.ts', true)
    const importerModules = importerFiles.map((file) => createModule(file))
    const connectionsByModule = new Map(
      importerModules.map((module) => [
        module,
        [
          {
            dependency: { request: './marked' },
            module: markedModule,
          },
        ],
      ]),
    )

    await processAssetsHandler({
      environment: { name: 'client' },
      compilation: {
        entries: new Map(),
        errors: [],
        inputFileSystem: null,
        modules: new Set([...importerModules, markedModule]),
        moduleGraph: {
          getOutgoingConnectionsInOrder(module: unknown) {
            return connectionsByModule.get(module as any) ?? []
          },
        },
        warnings: [],
      },
      compiler: { rspack: {} },
    })

    return onViolation
  }

  test('skips marker violations imported only by an ignored importer', async () => {
    const onViolation = await runMarkerBuild(['/app/src/ignored.ts'])

    expect(onViolation).not.toHaveBeenCalled()
  })

  test('reports a marker shared with a non-ignored importer', async () => {
    const onViolation = await runMarkerBuild([
      '/app/src/ignored.ts',
      '/app/src/entry.ts',
    ])

    expect(onViolation).toHaveBeenCalledTimes(1)
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({
        importer: '/app/src/marked.ts',
        type: 'marker',
      }),
    )
  })
})
