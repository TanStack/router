/**
 * Vue's `<script setup>` on a real Vite dev server (`@vitejs/plugin-vue`,
 * `tanstackStart()` of `@tanstack/vue-start`): in development the plugin
 * exposes the block's bindings to the template through a generated object, so
 * a binding that holds a Start value is no use of it. The same in an object
 * the block writes itself is one (SPEC J4.5, J4.12).
 */
import { afterAll, expect, test } from 'vitest'
import { compileError, createStartHost } from '../regression-helpers'
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

async function caseOf(script: string) {
  const host = await createStartHost({ framework: 'vue' })
  hosts.push(host)
  return host.case({
    'b.ts': builder,
    'Page.vue': `<script setup>
${script}
</script>

<template>
  <p>page</p>
</template>
`,
    'module.ts': `export { default } from './Page.vue'\n`,
  })
}

test.each([
  {
    name: 'a server fn in the block',
    script: `import { createServerFn } from '@tanstack/vue-start'
const fn = createServerFn().handler(async () => 'MARK_SERVER_SECRET')
console.log(fn)`,
  },
  {
    name: 'a chain finished in the block',
    script: `import { base } from './b'
const fn = base.handler(async () => 'MARK_SERVER_SECRET')
console.log(fn)`,
  },
  {
    name: 'an imported builder the block never uses',
    script: `import { base, label } from './b'
console.log(label)`,
  },
  {
    name: 'a builder a `const` holds',
    script: `import { createMiddleware } from '@tanstack/vue-start'
const open = createMiddleware({ type: 'function' })
const m = open.server(async ({ next }) => {
  console.log('MARK_SERVER_SECRET')
  return next()
})
console.log(m)`,
  },
  {
    name: 'a builder a `let` holds',
    script: `import { createMiddleware } from '@tanstack/vue-start'
let open = createMiddleware({ type: 'function' })
open = open.middleware([])
const m = open.server(async ({ next }) => {
  console.log('MARK_SERVER_SECRET')
  return next()
})
console.log(m)`,
  },
  {
    name: 'a namespace with a builder',
    script: `import * as b from './b'
console.log(b.label)`,
  },
])('$name compiles', async ({ script }) => {
  const startCase = await caseOf(script)
  expect(await compileError(startCase, 'client', 'Page.vue')).toBeUndefined()
  expect(await startCase.served('Page.vue', 'client')).not.toContain(
    'MARK_SERVER_SECRET',
  )
})

test.each([
  {
    name: 'an object of the block with a getter',
    script: `import { createServerFn } from '@tanstack/vue-start'
const own = { get make() { return createServerFn } }
console.log(own)`,
  },
  {
    name: 'an object of the block holding a builder',
    script: `import { base } from './b'
const own = { base }
console.log(own)`,
  },
  {
    name: 'an object of the block named like the generated one',
    script: `import { base } from './b'
const nested = () => {
  const returned = { base }
  return returned
}
console.log(nested)`,
  },
])('$name is refused', async ({ script }) => {
  const startCase = await caseOf(script)
  expect(await compileError(startCase, 'client', 'Page.vue')).toBeInstanceOf(
    Error,
  )
})
