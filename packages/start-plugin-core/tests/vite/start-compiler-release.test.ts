import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import { VITE_ENVIRONMENT_NAMES } from '../../src/constants'
import { startCompilerPlugin } from '../../src/vite/start-compiler-plugin/plugin'

setFlagsFromString('--expose-gc')
const collectGarbage = runInNewContext('gc') as () => void

function createClientPlugin() {
  const plugins = (
    startCompilerPlugin({
      framework: 'react',
      environments: [{ name: VITE_ENVIRONMENT_NAMES.client, type: 'client' }],
      providerEnvName: VITE_ENVIRONMENT_NAMES.server,
    }) as Array<any>
  ).flat()

  return plugins.find(
    (plugin) =>
      plugin.name ===
      `tanstack-start-core::server-fn:${VITE_ENVIRONMENT_NAMES.client}`,
  )
}

// Runs one transform in a fresh hook context, the way a build's plugin driver
// does, and hands back only a weak reference to that context.
async function transformInFreshContext(plugin: any) {
  const context = {
    environment: {
      name: VITE_ENVIRONMENT_NAMES.client,
      mode: 'build',
      config: { experimental: {} },
    },
    load: () => Promise.resolve(null),
    resolve: () => Promise.resolve(null),
    error: (message: string) => {
      throw new Error(message)
    },
    warn: () => {},
  }

  await plugin.transform.handler.call(
    context,
    'export const value = 1',
    '/project/src/value.ts',
  )

  return new WeakRef(context)
}

describe('startCompilerPlugin in a build', () => {
  test('releases the hook context once the environment bundle closes', async () => {
    const plugin = createClientPlugin()
    plugin.buildStart.call({
      environment: { name: VITE_ENVIRONMENT_NAMES.client, mode: 'build' },
    })

    const contextRef = await transformInFreshContext(plugin)

    plugin.closeBundle?.call({
      environment: { name: VITE_ENVIRONMENT_NAMES.client, mode: 'build' },
    })

    // A WeakRef keeps its target alive until the current job ends.
    await new Promise((resolve) => setTimeout(resolve, 0))
    collectGarbage()

    expect(contextRef.deref()).toBeUndefined()
  })
})
