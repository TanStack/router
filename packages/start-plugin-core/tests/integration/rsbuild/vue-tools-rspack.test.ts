/**
 * A Vue single-file component on Start's Rsbuild plugin with vue-loader
 * configured through `tools.rspack` (its rule and its `VueLoaderPlugin`)
 * instead of `@rsbuild/plugin-vue` (SPEC J4.12, G5): the SFC's script block
 * is a module of the app, and Start compiles it as with the plugin
 * (`vue-sfc.test.ts`). A plain `<script>`'s server fn keeps its handler on
 * the server and the client calls it by id, and a `<script setup>` block's
 * isomorphic fn runs its client implementation (a server fn there is a
 * compile error: R162), with vue-loader's inline match resource and without
 * it, and with the app's own subclass of `VueLoaderPlugin`.
 */
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, test } from 'vitest'
import { buildStartShared, callByIdPrelude } from '../../build-harness'
import type { StartBuild } from '../../build-harness'

const timeout = 120_000

/** vue-loader for Rspack, the one `@rsbuild/plugin-vue` uses. */
const vueLoader = createRequire(
  createRequire(import.meta.url).resolve('@rsbuild/plugin-vue'),
).resolve('rspack-vue-loader')
const { VueLoaderPlugin } = createRequire(import.meta.url)(vueLoader) as {
  VueLoaderPlugin: new () => object
}

/** An app's own `VueLoaderPlugin` (a subclass: another class name). */
class AppVueLoaderPlugin extends VueLoaderPlugin {}

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
import { createIsomorphicFn } from '@tanstack/vue-start'
const iso = createIsomorphicFn()
  .server(() => 'MARK_SETUP_TS')
  .client(() => 'client implementation')
defineExpose({ iso })
</script>

<template>
  <p>isomorphic</p>
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
  {
    name: 'inline match resource',
    inlineMatchResource: true,
    Plugin: VueLoaderPlugin,
  },
  {
    name: 'no inline match resource',
    inlineMatchResource: false,
    Plugin: VueLoaderPlugin,
  },
  {
    name: 'inline match resource, a VueLoaderPlugin subclass',
    inlineMatchResource: true,
    Plugin: AppVueLoaderPlugin,
  },
])('rsbuild build, $name', ({ inlineMatchResource, Plugin }) => {
  let build: StartBuild
  beforeAll(async () => {
    build = await buildStartShared({
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
            config.plugins.push(new Plugin() as never)
            return config
          },
        },
      },
    })
    return () => build.close()
  }, timeout)

  test('a server fn of a plain <script> keeps its handler on the server, and the client calls it by id', async () => {
    expect(build.client.where('MARK_PLAIN')).toBe('nowhere')
    expect(build.ssr.where('MARK_PLAIN')).not.toBe('nowhere')
    const url = (await build.client.run(`return entry.plainFn.url`)).result
    const { result } = await build.ssr.run(
      `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
    )
    expect(result).toBe('MARK_PLAIN')
  })

  test('an isomorphic fn of a <script setup lang="ts"> block runs its client implementation in the client', async () => {
    expect(build.client.where('MARK_SETUP_TS')).toBe('nowhere')
    const { result } = await build.client.run(
      `return entry.mount(entry.Setup).iso()`,
    )
    expect(result).toBe('client implementation')
  })
})
