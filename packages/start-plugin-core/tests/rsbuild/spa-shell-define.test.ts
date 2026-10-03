import { describe, expect, test } from 'vitest'
import { createRsbuild } from '@rsbuild/core'
import { fileURLToPath } from 'node:url'
import { tanStackStartRsbuild } from '../../src/rsbuild/plugin'
import type { TanStackStartRsbuildPluginCoreOptions } from '../../src/rsbuild/types'

const appRoot = fileURLToPath(
  new URL('../../../../examples/react/start-basic-rsbuild/', import.meta.url),
)

const coreOptions: TanStackStartRsbuildPluginCoreOptions = {
  framework: 'react',
  defaultEntryPaths: {
    client: '/app/client.ts',
    server: '/app/server.ts',
    start: '/app/start.ts',
  },
  providerEnvironmentName: 'ssr',
  ssrIsProvider: true,
}

describe('Rsbuild SPA shell define', () => {
  test.each([
    { action: 'dev', spa: { enabled: true }, expected: 'true' },
    { action: 'dev', spa: {}, expected: 'true' },
    { action: 'dev', spa: { enabled: false }, expected: 'false' },
    { action: 'dev', spa: undefined, expected: 'false' },
    { action: 'build', spa: { enabled: true }, expected: undefined },
  ] as const)('$action with spa $spa', async ({ action, spa, expected }) => {
    const rsbuild = await createRsbuild({
      cwd: appRoot,
      rsbuildConfig: {
        plugins: [tanStackStartRsbuild(coreOptions, { spa })],
      },
    })

    const configs = await rsbuild.initConfigs({ action })
    expect(configs.length).toBeGreaterThan(0)
    const config = await rsbuild.inspectConfig()
    const define = config.origin.rsbuildConfig.source?.define
    expect(define?.['process.env.TSS_SHELL']).toBe(
      expected === undefined ? undefined : JSON.stringify(expected),
    )
    expect(define?.['import.meta.env.TSS_SHELL']).toBe(
      expected === undefined ? undefined : JSON.stringify(expected),
    )
  })
})
