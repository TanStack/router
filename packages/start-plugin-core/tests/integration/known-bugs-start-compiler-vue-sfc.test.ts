/**
 * Known Start compiler bug in a Vue single-file component, through the
 * public Start host (`createStartHost`): a Vue Start app with
 * `tanstackStart()` of `@tanstack/vue-start/plugin/vite` and Vue's own Vite
 * plugin (`@vitejs/plugin-vue`, which serves an SFC's `<script lang="ts">`
 * block in builds as its own module, `Page.vue?vue&type=script&lang.ts`),
 * built with `vite build` (`build()`). Moved from
 * pending-rulings/known-bugs-start-compiler-vue-sfc.test.ts (formerly
 * known-bugs-start-compiler.test.ts:1629-1650, on the internal compiler)
 * once `@vitejs/plugin-vue` became a test-only devDependency (coordinator
 * 2026-10-21, B2 questions).
 */
import { afterAll, expect, test } from 'vitest'
import { createStartHost } from '../regression-helpers'
import type { StartHost } from '../regression-helpers'

const hosts: Array<StartHost> = []
afterAll(async () => {
  for (const host of hosts) {
    await host.close()
  }
})

/**
 * Builds a Vue Start app whose case has an SFC `Page.vue` with `script` as
 * its `<script lang="ts">` block (a server fn `fn` whose handler reads the
 * server-only `./db.server`), re-exported by the case module, and checks
 * that the build succeeds with the SFC in the client build and the
 * server-only module not shipped there.
 */
async function expectSfcServerFnBuilds(script: string) {
  const host = await createStartHost({ framework: 'vue', serve: false })
  hosts.push(host)
  const startCase = await host.case({
    'Page.vue': `<script lang="ts">
${script}
export default {}
</script>

<template>
  <p>page</p>
</template>
`,
    'db.server.ts': `export const db = { x: (input: string) => 'MARK_DB_SERVER:' + input }\n`,
    'module.ts': `export { fn } from './Page.vue'\n`,
  })
  const build = await host.build()
  const client = build.environments.client!.chunks
  // The SFC is in the client build (through the case module)
  expect(
    client.some((chunk) =>
      chunk.moduleIds.some((id) => id.startsWith(startCase.file('Page.vue'))),
    ),
  ).toBe(true)
  for (const chunk of client) {
    expect(chunk.code, chunk.fileName).not.toContain('MARK_DB_SERVER')
  }
}

const head = `import { createServerFn } from '@tanstack/vue-start'
import { db } from './db.server'
`

// Control (same harness): the block without TypeScript-only syntax.
test('build: a server fn in a <script lang="ts"> block', async () => {
  await expectSfcServerFnBuilds(`${head}const input = (globalThis as any).input as string
export const fn = createServerFn().handler(async () => db.x(input))`)
})

// Bug: the parser is chosen from the module id without its query, so the
// `<script lang="ts">` block of a Vue SFC, which @vitejs/plugin-vue 6
// serves in builds as `Page.vue?vue&type=script&lang.ts` (genScriptCode,
// attrsToQuery), is parsed as TSX. (A `<script setup>` block cannot hold
// the exported server fn.)
// Impact: TypeScript-only syntax such as a `<string>value` assertion fails
// the build.
// Fix-agnostic: the build succeeds, the SFC is in the client build, and
// the server-only module the handler reads is not.
test.fails(
  'build: a server fn in a <script lang="ts"> block may use angle-bracket type assertions',
  async () => {
    await expectSfcServerFnBuilds(`${head}const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))`)
  },
)
