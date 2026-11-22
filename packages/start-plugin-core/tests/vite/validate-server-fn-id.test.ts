import { describe, expect, test } from 'vitest'
import { startCompilerPlugin } from '../../src/vite/start-compiler-plugin/plugin'
import type { Plugin } from 'vite'

function getValidateHandler() {
  const plugins = startCompilerPlugin({
    framework: 'react',
    environments: [],
    providerEnvName: 'ssr',
  }) as Array<Plugin>
  const plugin = plugins.find(
    (p) => p.name === 'tanstack-start-core:validate-server-fn-id',
  )!
  return (
    plugin.load as {
      handler: (this: unknown, id: string) => Promise<string>
    }
  ).handler
}

describe('validate-server-fn-id', () => {
  test.each(['constructor', '__proto__', 'toString'])(
    'rejects the Object.prototype member id %s',
    async (fnId) => {
      const handler = getValidateHandler()
      const context = {
        environment: { mode: 'dev' },
        error: (message: string) => {
          throw new Error(message)
        },
      }
      await expect(
        handler.call(
          context,
          `\0virtual:tanstack-start-validate-server-fn-id?id=${fnId}`,
        ),
      ).rejects.toThrow(`Invalid server function ID: ${fnId}`)
    },
  )
})
