import { KindDetectionPatterns, LookupKindsPerEnv } from './compiler'
import type { LookupConfig, LookupKind } from './compiler'
import type { CompileStartFrameworkOptions } from '../types'

export function getTransformCodeFilterForEnv(
  env: 'client' | 'server',
): Array<RegExp> {
  const validKinds = LookupKindsPerEnv[env]
  const patterns: Array<RegExp> = []

  for (const [kind, pattern] of Object.entries(KindDetectionPatterns) as Array<
    [LookupKind, RegExp]
  >) {
    if (validKinds.has(kind)) {
      patterns.push(pattern)
    }
  }

  return patterns
}

export function getLookupConfigurationsForEnv(
  env: 'client' | 'server',
  framework: CompileStartFrameworkOptions,
): Array<LookupConfig> {
  const commonConfigs: Array<LookupConfig> = [
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createServerFn',
      kind: 'Root',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createIsomorphicFn',
      kind: 'IsomorphicFn',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createServerOnlyFn',
      kind: 'ServerOnlyFn',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createClientOnlyFn',
      kind: 'ClientOnlyFn',
    },
  ]

  if (env === 'client') {
    return [
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createMiddleware',
        kind: 'Root',
      },
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createStart',
        kind: 'Root',
      },
      ...commonConfigs,
    ]
  }

  return [
    ...commonConfigs,
    {
      libName: `@tanstack/${framework}-router`,
      rootExport: 'ClientOnly',
      kind: 'ClientOnlyJSX',
    },
  ]
}
