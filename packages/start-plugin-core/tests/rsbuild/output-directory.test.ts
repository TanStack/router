import { describe, expect, test } from 'vitest'
import {
  createRsbuildEnvironmentDefaults,
  createRsbuildEnvironmentPlan,
  resolveRsbuildAssetBase,
  resolveRsbuildOutputDirectory,
} from '../../src/rsbuild/planning'

describe('createRsbuildEnvironmentDefaults', () => {
  test('provides framework defaults when the user leaves them unset', () => {
    const clientDefaults = createRsbuildEnvironmentDefaults({
      environmentName: 'client',
      config: {},
      isDev: true,
      rscEnabled: true,
      serverFnProviderEnv: 'ssr',
    })
    const serverDefaults = createRsbuildEnvironmentDefaults({
      environmentName: 'ssr',
      config: {},
      isDev: true,
      rscEnabled: true,
      serverFnProviderEnv: 'ssr',
    })

    expect(clientDefaults.output?.module).toBe(true)
    expect(clientDefaults.performance?.chunkSplit).toEqual({
      strategy: 'custom',
      override: {
        chunks: 'async',
      },
    })
    expect(serverDefaults.output?.module).toBe(false)
    expect(serverDefaults.splitChunks).toEqual({
      preset: 'single-vendor',
    })
  })

  test('does not shadow values in the shared client config', () => {
    const defaults = createRsbuildEnvironmentDefaults({
      environmentName: 'client',
      config: {
        output: {
          module: false,
        },
        performance: {
          chunkSplit: {
            strategy: 'split-by-experience',
          },
        },
      },
      isDev: true,
      rscEnabled: true,
      serverFnProviderEnv: 'ssr',
    })

    expect(defaults).toEqual({})
  })

  test('does not shadow values in the shared server config', () => {
    const defaults = createRsbuildEnvironmentDefaults({
      environmentName: 'ssr',
      config: {
        output: {
          module: true,
        },
        splitChunks: false,
      },
      isDev: true,
      rscEnabled: true,
      serverFnProviderEnv: 'ssr',
    })

    expect(defaults).toEqual({})
  })

  test('does not shadow values in an environment config', () => {
    const defaults = createRsbuildEnvironmentDefaults({
      environmentName: 'client',
      config: {
        environments: {
          client: {
            output: {
              module: false,
            },
            performance: {
              chunkSplit: {
                strategy: 'all-in-one',
              },
            },
          },
        },
      },
      isDev: true,
      rscEnabled: false,
      serverFnProviderEnv: 'ssr',
    })

    expect(defaults).toEqual({})
  })
})

describe('resolveRsbuildOutputDirectory', () => {
  test('uses explicit environment distPath string', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: 'custom/client',
        rootDistPath: 'build',
        fallback: 'dist/client',
        subdirectory: 'client',
      }),
    ).toBe('custom/client')
  })

  test('uses explicit environment distPath root object', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: { root: 'custom/server' },
        rootDistPath: { root: 'build' },
        fallback: 'dist/server',
        subdirectory: 'server',
      }),
    ).toBe('custom/server')
  })

  test('derives environment directory from top-level string distPath', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: undefined,
        rootDistPath: 'build',
        fallback: 'dist/client',
        subdirectory: 'client',
      }),
    ).toBe('build/client')
  })

  test('derives environment directory from top-level root distPath object', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: undefined,
        rootDistPath: { root: 'build' },
        fallback: 'dist/server',
        subdirectory: 'server',
      }),
    ).toBe('build/server')
  })

  test('falls back to default directory when no distPath is configured', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: undefined,
        rootDistPath: undefined,
        fallback: 'dist/client',
        subdirectory: 'client',
      }),
    ).toBe('dist/client')
  })
})

describe('resolveRsbuildAssetBase', () => {
  test('uses the production asset prefix for build and preview', () => {
    for (const action of ['build', 'preview'] as const) {
      expect(
        resolveRsbuildAssetBase({
          action,
          config: {
            server: { base: '/app/' },
            output: { assetPrefix: 'https://cdn.example.com/assets/' },
          },
        }),
      ).toBe('https://cdn.example.com/assets/')
    }
  })

  test('uses the development asset prefix in dev', () => {
    expect(
      resolveRsbuildAssetBase({
        action: 'dev',
        config: {
          dev: { assetPrefix: '/dev-assets/' },
          output: { assetPrefix: 'https://cdn.example.com/assets/' },
          server: { base: '/app/' },
        },
      }),
    ).toBe('/dev-assets/')
  })

  test('prefers the client environment asset prefix over the root config', () => {
    expect(
      resolveRsbuildAssetBase({
        action: 'build',
        environmentName: 'client',
        config: {
          output: { assetPrefix: '/root-assets/' },
          environments: {
            client: {
              output: { assetPrefix: 'https://cdn.example.com/client/' },
            },
            ssr: {
              output: { assetPrefix: '/server-assets/' },
            },
          },
        },
      }),
    ).toBe('https://cdn.example.com/client/')
  })

  test('prefers the client development asset prefix in dev', () => {
    expect(
      resolveRsbuildAssetBase({
        action: 'dev',
        environmentName: 'client',
        config: {
          dev: { assetPrefix: '/root-dev-assets/' },
          environments: {
            client: {
              dev: { assetPrefix: '/client-dev-assets/' },
            },
          },
        },
      }),
    ).toBe('/client-dev-assets/')
  })

  test('falls back to server.base when the active asset prefix is not concrete', () => {
    expect(
      resolveRsbuildAssetBase({
        action: 'build',
        config: {
          output: { assetPrefix: 'auto' },
          server: { base: '/app/' },
        },
      }),
    ).toBe('/app/')
  })
})

describe('createRsbuildEnvironmentPlan client output', () => {
  const baseOptions = {
    entryAliases: {
      client: '/app/src/client.tsx',
      server: '/app/src/server.ts',
      start: '/app/src/start.ts',
      router: '/app/src/router.tsx',
      alias: {
        'virtual:tanstack-start-client-entry': '/app/src/client.tsx',
        'virtual:tanstack-start-server-entry': '/app/src/server.ts',
        '#tanstack-start-entry': '/app/src/start.ts',
        '#tanstack-router-entry': '/app/src/router.tsx',
      },
    },
    clientOutputDirectory: 'dist/client',
    serverOutputDirectory: 'dist/server',
    serverFnProviderEnv: 'ssr',
    enforcedDefines: {},
    enforcedAliases: {
      'virtual:tanstack-start-client-entry': '/app/src/client.tsx',
      'virtual:tanstack-start-server-entry': '/app/src/server.ts',
      '#tanstack-start-entry': '/app/src/start.ts',
      '#tanstack-router-entry': '/app/src/router.tsx',
    },
  }

  test('leaves assetPrefix unset so environments inherit the root config', () => {
    const environments = createRsbuildEnvironmentPlan(baseOptions).environments

    expect(environments.client!.output?.assetPrefix).toBeUndefined()
    expect(environments.ssr!.output?.assetPrefix).toBeUndefined()
    expect(environments.client!.performance).toBeUndefined()
    expect(
      createRsbuildEnvironmentPlan({ ...baseOptions, rsc: true }).environments
        .ssr!.splitChunks,
    ).toBeUndefined()
  })

  test('applies enforced defines and aliases to every managed environment', () => {
    const enforcedDefines = {
      'process.env.TSS_SERVER_FN_BASE': '"/_serverFn/"',
    }
    const environments = createRsbuildEnvironmentPlan({
      ...baseOptions,
      serverFnProviderEnv: 'server-fn',
      enforcedDefines,
    }).environments

    expect(environments.client!.source?.define).toBe(enforcedDefines)
    expect(environments.ssr!.source?.define).toBe(enforcedDefines)
    expect(environments['server-fn']!.source?.define).toBe(enforcedDefines)
    expect(environments.client!.resolve?.alias).toBe(
      baseOptions.enforcedAliases,
    )
    expect(environments.ssr!.resolve?.alias).toBe(baseOptions.enforcedAliases)
    expect(environments['server-fn']!.resolve?.alias).toBe(
      baseOptions.enforcedAliases,
    )
  })
})
