import { describe, expect, test, vi } from 'vitest'
import { compileMatchers } from '../../src/import-protection/matchers'
import {
  getRsbuildResolvedImportProtectionCheck,
  registerImportProtection,
} from '../../src/rsbuild/import-protection'

type ImportProtectionApi = Parameters<typeof registerImportProtection>[0]
type ModifyRspackConfigHandler = Parameters<
  ImportProtectionApi['modifyRspackConfig']
>[0]
type ProcessAssetsHandler = Parameters<ImportProtectionApi['processAssets']>[1]
type ProcessAssetsContext = Parameters<ProcessAssetsHandler>[0]

interface MockRspackModule {
  buildInfo: Record<string, unknown>
  resourceResolveData: { path: string; resource: string }
  identifier: () => string
  originalSource: () => {
    sourceAndMap: () => {
      source: string
      map: null
    }
  }
}

interface MockRspackConnection {
  dependency: { request: string }
  module: MockRspackModule
}

interface MockProcessAssetsContext {
  environment: { name: string }
  compilation: {
    entries: Map<unknown, unknown>
    errors: Array<Error>
    inputFileSystem: null
    modules: Set<MockRspackModule>
    moduleGraph: {
      getOutgoingConnectionsInOrder: (
        module: MockRspackModule,
      ) => Array<MockRspackConnection>
    }
    warnings: Array<Error>
  }
  compiler: { rspack: Record<string, never> }
}

function asProcessAssetsContext(
  context: MockProcessAssetsContext,
): ProcessAssetsContext {
  return context as unknown as ProcessAssetsContext
}

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

describe('registerImportProtection loader registration', () => {
  test('registers a post loader instead of an Rsbuild transform', () => {
    let modifyRspackConfig: ModifyRspackConfigHandler | undefined
    const transform = vi.fn()

    const api = {
      context: { action: 'build' },
      onBeforeBuild() {},
      onBeforeDevCompile() {},
      modifyRspackConfig(handler) {
        modifyRspackConfig = handler
      },
      transform,
      processAssets() {},
    } satisfies ImportProtectionApi & { transform: typeof transform }

    registerImportProtection(api, {
      framework: 'react',
      environments: [{ name: 'client', type: 'client' }],
      getConfig: () => ({
        startConfig: {},
        resolvedStartConfig: {
          root: '/app',
          srcDirectory: '/app/src',
        },
      }),
    })

    if (!modifyRspackConfig) {
      throw new Error('Expected modifyRspackConfig to be registered')
    }

    class VirtualModulesPlugin {
      constructor(_modules: Record<string, string>) {}

      writeModule(_filePath: string, _contents: string) {}
    }

    const config: Parameters<ModifyRspackConfigHandler>[0] = {
      module: { rules: [] },
      plugins: [],
    }
    const utils: Parameters<ModifyRspackConfigHandler>[1] = {
      environment: { name: 'client' },
      rspack: {
        experiments: { VirtualModulesPlugin },
      },
    }
    modifyRspackConfig(config, utils)

    expect(transform).not.toHaveBeenCalled()
    const rules = config.module.rules
    expect(rules).toHaveLength(1)
    const rule = rules?.[0]
    if (!rule || typeof rule !== 'object' || !('test' in rule)) {
      throw new Error('Expected an import-protection Rspack rule')
    }
    expect(rule).toMatchObject({
      enforce: 'post',
      use: [
        {
          loader: expect.stringMatching(/import-protection-loader\.js$/),
          options: {
            envName: 'client',
          },
        },
      ],
    })
    expect(rule.test).toEqual(/\.[cm]?[tj]sx?$/)
  })
})

describe('registerImportProtection marker scope', () => {
  async function runMarkerBuild(importerFiles: Array<string>) {
    let beforeBuild: (() => void) | undefined
    let processAssetsHandler: ProcessAssetsHandler | undefined
    const onViolation = vi.fn(() => false)

    const api = {
      context: { action: 'build' },
      onBeforeBuild(handler) {
        beforeBuild = handler
      },
      onBeforeDevCompile() {},
      modifyRspackConfig() {},
      processAssets(_options, handler) {
        processAssetsHandler = handler
      },
    } satisfies ImportProtectionApi

    registerImportProtection(api, {
      framework: 'react',
      environments: [{ name: 'client', type: 'client' }],
      getConfig: () => ({
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
      }),
    })

    if (!beforeBuild || !processAssetsHandler) {
      throw new Error('Expected import-protection hooks to be registered')
    }
    beforeBuild()

    const createModule = (file: string, marker = false): MockRspackModule => ({
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
    const connectionsByModule = new Map<
      MockRspackModule,
      Array<MockRspackConnection>
    >(
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

    const context: MockProcessAssetsContext = {
      environment: { name: 'client' },
      compilation: {
        entries: new Map(),
        errors: [],
        inputFileSystem: null,
        modules: new Set([...importerModules, markedModule]),
        moduleGraph: {
          getOutgoingConnectionsInOrder(module) {
            return connectionsByModule.get(module) ?? []
          },
        },
        warnings: [],
      },
      compiler: { rspack: {} },
    }

    await processAssetsHandler(asProcessAssetsContext(context))

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
