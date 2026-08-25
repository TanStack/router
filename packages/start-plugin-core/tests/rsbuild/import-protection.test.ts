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

describe('registerImportProtection transform', () => {
  test('does not read original source through the filesystem', async () => {
    let beforeBuild: (() => void) | undefined
    let modifyRspackConfig: ((config: any, utils: any) => void) | undefined
    let transformHandler: ((context: any) => Promise<unknown>) | undefined
    let processAssetsHandler: ((context: any) => Promise<void>) | undefined

    const api = {
      context: { action: 'build' },
      onBeforeBuild(handler: () => void) {
        beforeBuild = handler
      },
      onBeforeDevCompile() {},
      modifyRspackConfig(handler: (config: any, utils: any) => void) {
        modifyRspackConfig = handler
      },
      transform(
        _options: unknown,
        handler: (context: any) => Promise<unknown>,
      ) {
        transformHandler = handler
      },
      processAssets(
        _options: unknown,
        handler: (context: any) => Promise<void>,
      ) {
        processAssetsHandler = handler
      },
    }

    registerImportProtection(api as any, {
      framework: 'react',
      environments: [{ name: 'client', type: 'client' }],
      getConfig: () =>
        ({
          startConfig: {},
          resolvedStartConfig: {
            root: '/app',
            srcDirectory: '/app/src',
          },
        }) as any,
    })

    if (
      !beforeBuild ||
      !modifyRspackConfig ||
      !transformHandler ||
      !processAssetsHandler
    ) {
      throw new Error('Expected import-protection hooks to be registered')
    }

    beforeBuild()

    class VirtualModulesPlugin {}
    const rspackConfig = { plugins: [] as Array<any> }
    modifyRspackConfig(rspackConfig, {
      environment: { name: 'client' },
      rspack: {
        experiments: { VirtualModulesPlugin },
      },
    })

    const readFile = vi.fn(
      (_file: string, callback: (error: null, data: Buffer) => void) => {
        callback(null, Buffer.from(`import { secret } from './secret.server'`))
      },
    )
    const rspackPlugin = rspackConfig.plugins[1]
    rspackPlugin.apply({
      inputFileSystem: { readFile },
      hooks: {
        thisCompilation: { tap: vi.fn() },
      },
    })

    const code = `import { value } from './safe'\nexport { value }`
    const result = await transformHandler({
      code,
      resource: '/app/src/entry.ts',
      resourcePath: '/app/src/entry.ts',
      context: '/app/src',
      resolve: vi.fn(),
    })

    expect(result).toBe(code)

    await processAssetsHandler({
      environment: { name: 'client' },
      compilation: {
        modules: new Set(),
        entries: new Map(),
        moduleGraph: {},
        inputFileSystem: { readFile },
        errors: [],
        warnings: [],
      },
      compiler: { rspack: {} },
    })

    expect(readFile).not.toHaveBeenCalled()
  })
})
