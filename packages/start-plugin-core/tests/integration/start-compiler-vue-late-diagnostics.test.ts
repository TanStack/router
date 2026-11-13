/**
 * Where the refusal of a Vue `<script setup>` block points on a real Vite
 * dev server (`@vitejs/plugin-vue`, `tanstackStart()` of
 * `@tanstack/vue-start`; SPEC §5.7, J4.5).
 *
 * In development the plugin hands the block's bindings to its template
 * through an object it generates (in JavaScript every import as a getter):
 * a builder or factory there is refused (KNOWN-BUGS). The refusal names
 * the binding at its declaration in the SFC, the code the author wrote,
 * not the generated object, whose position is past the block (or past the
 * file). An escape the author wrote keeps its own report.
 */
import { afterAll, describe, expect, test } from 'vitest'
import {
  compileError,
  createStartHost,
  expectCompileError,
} from '../regression-helpers'
import type { StartHost } from '../regression-helpers'

const hosts: Array<StartHost> = []
afterAll(async () => {
  for (const host of hosts) {
    await host.close()
  }
})

const builder = `import { createServerFn } from '@tanstack/vue-start'
export const base = createServerFn()
export const label = 'x'
`

const sfc = (
  script: string,
  lang?: 'ts',
) => `<script setup${lang ? ` lang="${lang}"` : ''}>
${script}
</script>

<template>
  <p>page</p>
</template>
`

async function refusalOf(source: string) {
  const host = await createStartHost({ framework: 'vue' })
  hosts.push(host)
  const startCase = await host.case({
    'b.ts': builder,
    'Page.vue': source,
    'module.ts': `export { default } from './Page.vue'\n`,
  })
  return compileError(startCase, 'client', 'Page.vue')
}

describe('vite dev', () => {
  test.each([
    {
      name: 'an imported factory',
      source: sfc(`import { ref } from 'vue'
import { createServerFn } from '@tanstack/vue-start'
const count = ref(0)
const fn = createServerFn().handler(async () => 'MARK_SERVER_SECRET')
console.log(fn, count)`),
      at: `import { createServerFn } from '@tanstack/vue-start'`,
    },
    {
      name: 'an imported builder',
      source: sfc(`import { ref } from 'vue'
import { base } from './b'
const count = ref(0)
const fn = base.handler(async () => 'MARK_SERVER_SECRET')
console.log(fn, count)`),
      at: `import { base } from './b'`,
    },
    {
      name: 'a namespace with a builder',
      source: sfc(`import { ref } from 'vue'
import * as b from './b'
const count = ref(0)
console.log(b.label, count)`),
      at: `import * as b from './b'`,
    },
    {
      name: 'a local holding an open builder (lang="ts")',
      source: sfc(
        `import { ref } from 'vue'
import { createMiddleware } from '@tanstack/vue-start'
const count = ref(0)
const open = createMiddleware({ type: 'function' })
const m = open.server(async ({ next }) => next())
console.log(m, count)`,
        'ts',
      ),
      at: `const open = createMiddleware({ type: 'function' })`,
    },
  ])(
    'a <script setup> block handing $name to its template is refused at its declaration in the SFC',
    async ({ source, at }) => {
      const refusal = await refusalOf(source)
      expectCompileError(refusal, { source, at })
    },
  )

  test('an escape the author wrote in a <script setup lang="ts"> block is refused', async () => {
    const source = sfc(
      `import { base } from './b'
const own = { base }
console.log(own)`,
      'ts',
    )
    expect(await refusalOf(source)).toBeInstanceOf(Error)
  })
})
