import { describe, expect, test } from 'vitest'
import { registerStartCompilerTransforms } from '../../src/rsbuild/start-compiler-host'
import type { RsbuildPluginAPI } from '@rsbuild/core'

type RuleLike = {
  test?: unknown
  enforce?: string
  use?: Array<{ loader: string }>
}

function applyConfigHooks(rules: Array<RuleLike>) {
  const configHooks: Array<(config: unknown, utils: unknown) => void> = []
  const api = {
    context: { action: 'build', rootPath: '/app' },
    modifyRspackConfig: (hook: (config: unknown, utils: unknown) => void) => {
      configHooks.push(hook)
    },
    transform: () => {},
  }

  registerStartCompilerTransforms(
    api as unknown as RsbuildPluginAPI,
    {
      environments: [{ name: 'client', type: 'client' }],
      root: '/app',
      framework: 'react',
      providerEnvName: 'ssr',
    } as Parameters<typeof registerStartCompilerTransforms>[1],
  )

  const config = { module: { rules }, plugins: [] as Array<unknown> }
  for (const hook of configHooks) {
    hook(config, { environment: { name: 'client' }, rspack: {} })
  }
  return config.module.rules
}

const isMetadataRule = (rule: RuleLike) =>
  rule.use?.some((use) =>
    use.loader.endsWith('start-compiler-metadata-loader.js'),
  ) ?? false

describe('server function metadata loader rule', () => {
  test('runs as the last pre loader, after the Start transform and before normal loaders', () => {
    // Like Rsbuild's JS rule: builtin SWC in the normal phase.
    const swcRule: RuleLike = {
      test: /\.[jt]sx?$/,
      use: [{ loader: 'builtin:swc-loader' }],
    }

    const rules = applyConfigHooks([swcRule])
    const metadataRules = rules.filter(isMetadataRule)

    expect(metadataRules).toHaveLength(1)
    // Pre loaders run right to left, so the first rule's pre loader runs last
    // among pre loaders. A pre loader also still runs for `!`-prefixed
    // requests, which skip normal loaders.
    expect(rules[0]).toBe(metadataRules[0])
    expect(rules[0]).toMatchObject({ enforce: 'pre' })
    expect(rules).toContain(swcRule)
  })
})
