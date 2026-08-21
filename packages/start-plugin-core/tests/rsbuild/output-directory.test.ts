import { describe, expect, test } from 'vitest'
import {
  createRsbuildEnvironmentPlan,
  resolveRsbuildOutputDirectory,
} from '../../src/rsbuild/planning'

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
