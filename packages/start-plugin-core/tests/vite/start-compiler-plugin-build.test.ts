import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'
import { startCompilerPlugin } from '../../src/vite/start-compiler-plugin/plugin'
import type { Plugin } from 'vite'

setFlagsFromString('--expose-gc')
const gc = runInNewContext('gc') as () => void

function getEnvironmentPlugin(envName: string) {
  const plugins = startCompilerPlugin({
    framework: 'react',
    environments: [
      { name: 'client', type: 'client' },
      { name: 'ssr', type: 'server' },
    ],
    providerEnvName: 'ssr',
  }) as Array<Plugin>
  const plugin = plugins.find(
    (p) => p.name === `tanstack-start-core::server-fn:${envName}`,
  )
  if (!plugin) {
    throw new Error(`Missing server-fn plugin for ${envName}`)
  }
  return plugin
}

async function runBuild(plugin: Plugin, envName: string) {
  const context = {
    environment: { name: envName, mode: 'build' },
    resolve: async () => null,
    load: async () => ({ code: '' }),
    warn: () => {},
    error: (message: string) => {
      throw new Error(message)
    },
  }
  const contextRef = new WeakRef(context)
  const transform = plugin.transform as {
    handler: (this: unknown, code: string, id: string) => Promise<unknown>
  }

  await (plugin.buildStart as Function).call(context)
  await transform.handler.call(
    context,
    `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(() => 'ok')`,
    '/app/src/server-fn.ts',
  )
  await (plugin.buildEnd as Function | undefined)?.call(context)

  return contextRef
}

test('releases the compiler and its hook context when an environment build ends', async () => {
  const plugin = getEnvironmentPlugin('client')
  const contextRef = await runBuild(plugin, 'client')

  for (let i = 0; i < 10 && contextRef.deref(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    gc()
  }

  expect(contextRef.deref()).toBeUndefined()
})
