/**
 * A Vue single-file component on Start's Rsbuild plugin with
 * `@rsbuild/plugin-vue` (rspack-vue-loader), as a Vue Start app's
 * `rsbuild.config.ts` lists it: the SFC's script block, `<script setup>` or
 * a plain `<script>`, is a module of the app, and Start compiles it like any
 * other (SPEC J4.12, G5). Its server fns keep their handlers on the server
 * and the client calls them by id; an isomorphic fn runs its client
 * implementation in the client. With vue-loader's inline match resource (the
 * plugin's default, which requests the block as `x.vue.js?vue&type=script…`)
 * and without it (`x.vue?vue&type=script…`); in a production build and on
 * the dev server.
 *
 * In development, vue-loader hands every binding of a `<script setup>`
 * block to its template through a generated object (in JavaScript every
 * import too, as a getter): a block that imports a builder or factory is a
 * compile error there (KNOWN-BUGS, `known-bugs-start-compiler-vue-script-setup`),
 * and `lang="ts"` (which hands over only the imports the template uses) is
 * the recipe. The dev rows are the TypeScript blocks and a plain `<script>`,
 * and a JavaScript block is refused without shipping its handler.
 */
import { pluginVue } from '@rsbuild/plugin-vue'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, callByIdPrelude } from '../../build-harness'
import {
  clientPage,
  runInClient,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import type { StartBuild } from '../../build-harness'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 120_000

/** A `<script setup>` block (`lang`) whose server fn the component exposes. */
const setupServerFn = (
  lang: 'js' | 'ts',
  mark: string,
) => `<script setup${lang === 'ts' ? ' lang="ts"' : ''}>
import { createServerFn } from '@tanstack/vue-start'
const fn = createServerFn().handler(async () => '${mark}')
defineExpose({ fn })
</script>

<template>
  <p>server fn</p>
</template>
`

/** A `<script setup>` block (`lang`) whose isomorphic fn the component exposes. */
const setupIsomorphic = (
  lang: 'js' | 'ts',
  mark: string,
) => `<script setup${lang === 'ts' ? ' lang="ts"' : ''}>
import { createIsomorphicFn } from '@tanstack/vue-start'
const iso = createIsomorphicFn()
  .server(() => '${mark}')
  .client(() => 'client implementation')
defineExpose({ iso })
</script>

<template>
  <p>isomorphic</p>
</template>
`

const files = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute()
`,
  'src/SetupJs.vue': setupServerFn('js', 'MARK_SETUP_JS'),
  'src/SetupTs.vue': setupServerFn('ts', 'MARK_SETUP_TS'),
  'src/IsoJs.vue': setupIsomorphic('js', 'MARK_ISO_JS'),
  'src/IsoTs.vue': setupIsomorphic('ts', 'MARK_ISO_TS'),
  'src/Plain.vue': `<script>
import { createServerFn } from '@tanstack/vue-start'
export const fn = createServerFn().handler(async () => 'MARK_PLAIN')
export default {}
</script>

<template>
  <p>plain</p>
</template>
`,
}

/**
 * `mount(component)` of the client entry: mounts the component with Vue's
 * renderer and gives what it exposes (`defineExpose`).
 */
const mountExport = `import { createApp } from 'vue'
export const mount = (component) =>
  createApp(component).mount(document.createElement('div'))
`

const vueOptions = [
  { name: 'inline match resource', inlineMatchResource: true },
  { name: 'no inline match resource', inlineMatchResource: false },
] as const

const vuePlugin = (inlineMatchResource: boolean) =>
  pluginVue({
    vueLoaderOptions: { experimentalInlineMatchResource: inlineMatchResource },
  })

describe.each(vueOptions)('rsbuild build, $name', ({ inlineMatchResource }) => {
  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler: 'rsbuild',
      framework: 'vue',
      files: {
        ...files,
        'src/entry.ts': `${mountExport}export { default as SetupJs } from './SetupJs.vue'
export { default as SetupTs } from './SetupTs.vue'
export { default as IsoJs } from './IsoJs.vue'
export { default as IsoTs } from './IsoTs.vue'
export { fn as plainFn } from './Plain.vue'
`,
        'src/ssr-entry.ts': `import './entry'
export { default as startServerEntry } from '@tanstack/vue-start/server-entry'
export { createClientRpc } from '@tanstack/vue-start/client-rpc'
`,
      },
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      rsbuildConfig: { plugins: [vuePlugin(inlineMatchResource)] },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
  }, timeout)
  afterAll(() => dispose?.())

  test.each([
    { name: '<script setup>', component: 'SetupJs', mark: 'MARK_SETUP_JS' },
    {
      name: '<script setup lang="ts">',
      component: 'SetupTs',
      mark: 'MARK_SETUP_TS',
    },
  ])(
    'a server fn of a $name block keeps its handler on the server, and the client calls it by id',
    async ({ component, mark }) => {
      expect(build.client.where(mark)).toBe('nowhere')
      expect(build.ssr.where(mark)).not.toBe('nowhere')
      const url = (
        await build.client.run(`return entry.mount(entry.${component}).fn.url`)
      ).result
      const { result } = await build.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe(mark)
    },
  )

  test('a server fn a plain <script> exports keeps its handler on the server, and the client calls it by id', async () => {
    expect(build.client.where('MARK_PLAIN')).toBe('nowhere')
    expect(build.ssr.where('MARK_PLAIN')).not.toBe('nowhere')
    const url = (await build.client.run(`return entry.plainFn.url`)).result
    const { result } = await build.ssr.run(
      `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
    )
    expect(result).toBe('MARK_PLAIN')
  })

  test.each([
    { name: '<script setup>', component: 'IsoJs', mark: 'MARK_ISO_JS' },
    {
      name: '<script setup lang="ts">',
      component: 'IsoTs',
      mark: 'MARK_ISO_TS',
    },
  ])(
    'an isomorphic fn of a $name block runs its client implementation in the client',
    async ({ component, mark }) => {
      expect(build.client.where(mark)).toBe('nowhere')
      const { result } = await build.client.run(
        `return entry.mount(entry.${component}).iso()`,
      )
      expect(result).toBe('client implementation')
    },
  )
})

describe.each(vueOptions)('rsbuild dev, $name', ({ inlineMatchResource }) => {
  let server: RsbuildDevServer
  beforeAll(async () => {
    server = await startRsbuildStartDevServer({
      ...clientPage,
      framework: 'vue',
      registerCleanup: (cleanup) => {
        afterAll(cleanup)
      },
      config: { plugins: [vuePlugin(inlineMatchResource)] },
      files: {
        ...files,
        // (the refused blocks only behind an import the page never runs)
        'src/entry.ts': `${mountExport}import SetupTs from './SetupTs.vue'
import IsoTs from './IsoTs.vue'
import { fn as plainFn } from './Plain.vue'
globalThis.__vueRows = {
  mount,
  SetupTs,
  IsoTs,
  plainFn,
  refused: () => [import('./SetupJs.vue'), import('./IsoJs.vue')],
}
`,
      },
    })
  }, timeout)

  const outputsWith = async (env: 'client' | 'ssr', mark: string) =>
    Object.values(await server.outputs(env)).some((code) => code.includes(mark))

  test('a server fn of a <script setup lang="ts"> block keeps its handler on the server, and the page calls it', async () => {
    expect(await outputsWith('client', 'MARK_SETUP_TS')).toBe(false)
    expect(await outputsWith('ssr', 'MARK_SETUP_TS')).toBe(true)
    expect(
      await runInClient(
        server,
        `const rows = globalThis.__vueRows\nreturn await rows.mount(rows.SetupTs).fn()`,
      ),
    ).toEqual({ result: 'MARK_SETUP_TS' })
  })

  test('a server fn a plain <script> exports keeps its handler on the server, and the page calls it', async () => {
    expect(await outputsWith('client', 'MARK_PLAIN')).toBe(false)
    expect(await outputsWith('ssr', 'MARK_PLAIN')).toBe(true)
    expect(
      await runInClient(server, `return await globalThis.__vueRows.plainFn()`),
    ).toEqual({ result: 'MARK_PLAIN' })
  })

  test('an isomorphic fn of a <script setup lang="ts"> block runs its client implementation on the page', async () => {
    expect(await outputsWith('client', 'MARK_ISO_TS')).toBe(false)
    expect(
      await runInClient(
        server,
        `const rows = globalThis.__vueRows\nreturn rows.mount(rows.IsoTs).iso()`,
      ),
    ).toEqual({ result: 'client implementation' })
  })

  test.each([
    { component: 'SetupJs.vue', mark: 'MARK_SETUP_JS' },
    { component: 'IsoJs.vue', mark: 'MARK_ISO_JS' },
  ])(
    'a JavaScript <script setup> block importing a factory ($component) is refused, and its server code does not reach the client',
    async ({ component, mark }) => {
      expectDiagnostic(server.diagnostics, {
        severity: 'error',
        file: `src/${component}`,
        root: server.root,
      })
      expect(await outputsWith('client', mark)).toBe(false)
    },
  )
})
