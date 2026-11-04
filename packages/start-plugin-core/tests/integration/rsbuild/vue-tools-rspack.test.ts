/**
 * A Vue single-file component on Start's Rsbuild plugin with vue-loader
 * configured through `tools.rspack` (its rule and its `VueLoaderPlugin`)
 * instead of `@rsbuild/plugin-vue` (SPEC J4.12, G5): the SFC's script block
 * is a module of the app, and Start compiles it as with the plugin
 * (`vue-sfc.test.ts`). Its server fn keeps its handler on the server and the
 * client calls it by id, with vue-loader's inline match resource and
 * without it.
 */
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart, callByIdPrelude } from '../../build-harness'
import type { StartBuild } from '../../build-harness'

const timeout = 120_000

/** vue-loader for Rspack, the one `@rsbuild/plugin-vue` uses. */
const vueLoader = createRequire(
  createRequire(import.meta.url).resolve('@rsbuild/plugin-vue'),
).resolve('rspack-vue-loader')
const { VueLoaderPlugin } = createRequire(import.meta.url)(vueLoader) as {
  VueLoaderPlugin: new () => object
}

const files = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute()
`,
  'src/Plain.vue': `<script>
import { createServerFn } from '@tanstack/vue-start'
export const fn = createServerFn().handler(async () => 'MARK_PLAIN')
export default {}
</script>

<template>
  <p>plain</p>
</template>
`,
  'src/Setup.vue': `<script setup lang="ts">
import { createServerFn } from '@tanstack/vue-start'
const fn = createServerFn().handler(async () => 'MARK_SETUP_TS')
defineExpose({ fn })
</script>

<template>
  <p>server fn</p>
</template>
`,
  'src/entry.ts': `import { createApp } from 'vue'
export const mount = (component) =>
  createApp(component).mount(document.createElement('div'))
export { fn as plainFn } from './Plain.vue'
export { default as Setup } from './Setup.vue'
`,
  'src/ssr-entry.ts': `import './entry'
export { default as startServerEntry } from '@tanstack/vue-start/server-entry'
export { createClientRpc } from '@tanstack/vue-start/client-rpc'
`,
}

describe.each([
  { name: 'inline match resource', inlineMatchResource: true },
  { name: 'no inline match resource', inlineMatchResource: false },
])('rsbuild build, $name', ({ inlineMatchResource }) => {
  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler: 'rsbuild',
      framework: 'vue',
      files,
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      rsbuildConfig: {
        tools: {
          rspack: (config) => {
            config.module.rules ??= []
            config.module.rules.push({
              test: /\.vue$/,
              loader: vueLoader,
              options: {
                experimentalInlineMatchResource: inlineMatchResource,
              },
            })
            config.plugins.push(new VueLoaderPlugin() as never)
            return config
          },
        },
      },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
  }, timeout)
  afterAll(() => dispose?.())

  test.each([
    {
      name: 'a plain <script>',
      read: 'entry.plainFn.url',
      mark: 'MARK_PLAIN',
    },
    {
      name: 'a <script setup lang="ts"> block',
      read: 'entry.mount(entry.Setup).fn.url',
      mark: 'MARK_SETUP_TS',
    },
  ])(
    'a server fn of $name keeps its handler on the server, and the client calls it by id',
    async ({ read, mark }) => {
      expect(build.client.where(mark)).toBe('nowhere')
      expect(build.ssr.where(mark)).not.toBe('nowhere')
      const url = (await build.client.run(`return ${read}`)).result
      const { result } = await build.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe(mark)
    },
  )
})
