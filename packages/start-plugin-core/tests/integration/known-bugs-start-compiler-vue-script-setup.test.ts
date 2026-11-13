/**
 * Vue's `<script setup>` on a real Vite dev server (`@vitejs/plugin-vue`,
 * `tanstackStart()` of `@tanstack/vue-start`).
 *
 * Bug: in development, and in builds with Vue's devtools (Vite:
 * `features.prodDevtools`, a true `__VUE_PROD_DEVTOOLS__` define,
 * `NODE_ENV=development`; Rsbuild: `NODE_ENV=development`), the plugin does
 * not inline the template: it hands the block's bindings to it through a
 * generated object (`const __returned__ = { base, get f() { return f } }`),
 * in JavaScript every import too, and that is a builder or factory going
 * where the compiler cannot follow it.
 * Impact: the SFC is a compile error there (the overlay, the build); no
 * server code ships. A default production build inlines the template and
 * builds. Workaround: `lang="ts"` (only the imports the template uses are
 * handed over), builders and middleware in a `.ts` module or a module-scope
 * `<script lang="ts">` (the recipe rows below). A fix must not need a
 * special case for the plugin's output (R92 amendment 3): the template can
 * attach server code to what it is handed, so the refusal must stay for a
 * template that does (the must-refuse rows below).
 */
import vue from '@vitejs/plugin-vue'
import { afterAll, describe, expect, test } from 'vitest'
import { StartBuildError, buildStart } from '../build-harness'
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

test.fails.each([
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

/**
 * A component whose template attaches a handler to a builder its block
 * hands it (`lang`): the generated render reads it off the handed-over
 * bindings, so a fix that ignores the generated object would ship the
 * handler to the client.
 */
const templateHandler = (
  lang?: 'ts',
) => `<script setup${lang ? ` lang="${lang}"` : ''}>
import { base } from './b'
</script>

<template>
  <p>{{ typeof base.handler(async () => 'MARK_SERVER_SECRET') }}</p>
</template>
`

/** The recipe: TypeScript blocks, builders at the module top level. */
const recipes = [
  {
    name: 'a server fn of a <script setup lang="ts"> block',
    sfc: `<script setup lang="ts">
import { createServerFn } from '@tanstack/vue-start'
const fn = createServerFn().handler(async () => 'MARK_SERVER_SECRET')
console.log(fn)
</script>

<template>
  <p>page</p>
</template>
`,
  },
  {
    name: 'an imported builder a <script setup lang="ts"> block never uses',
    sfc: `<script setup lang="ts">
import { base, label } from './b'
console.log(label)
</script>

<template>
  <p>{{ label }}</p>
</template>
`,
  },
  {
    name: 'a namespace with a builder in a <script setup lang="ts"> block',
    sfc: `<script setup lang="ts">
import * as b from './b'
console.log(b.label)
</script>

<template>
  <p>page</p>
</template>
`,
  },
  {
    name: 'an isomorphic fn of a <script setup lang="ts"> block',
    sfc: `<script setup lang="ts">
import { createIsomorphicFn } from '@tanstack/vue-start'
const iso = createIsomorphicFn()
  .server(() => 'MARK_SERVER_SECRET')
  .client(() => 'client')
console.log(iso())
</script>

<template>
  <p>page</p>
</template>
`,
  },
  {
    name: 'middleware and a server fn of a module-scope <script lang="ts">, called from <script setup lang="ts">',
    sfc: `<script lang="ts">
import { createMiddleware, createServerFn } from '@tanstack/vue-start'
const m = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  console.log('MARK_SERVER_SECRET')
  return next()
})
export const fn = createServerFn()
  .middleware([m])
  .handler(async () => 'MARK_SERVER_SECRET')
</script>

<script setup lang="ts">
console.log(fn)
</script>

<template>
  <p>page</p>
</template>
`,
  },
]

/** One dev host for the cases below (each case is its own module). */
let devHost: Promise<StartHost> | undefined
async function sfcCase(sfc: string) {
  devHost ??= createStartHost({ framework: 'vue' }).then((host) => {
    hosts.push(host)
    return host
  })
  return (await devHost).case({
    'b.ts': builder,
    'Page.vue': sfc,
    'module.ts': `export { default } from './Page.vue'\n`,
  })
}

describe('vite dev', () => {
  test.each([
    { name: '<script setup>', lang: undefined },
    { name: '<script setup lang="ts">', lang: 'ts' as const },
  ])(
    'a template attaching a handler to a builder a $name block hands it is refused',
    async ({ lang }) => {
      const startCase = await sfcCase(templateHandler(lang))
      expect(
        await compileError(startCase, 'client', 'Page.vue'),
      ).toBeInstanceOf(Error)
    },
  )

  test.each(recipes)('$name compiles', async ({ sfc }) => {
    const startCase = await sfcCase(sfc)
    expect(await compileError(startCase, 'client', 'Page.vue')).toBeUndefined()
    expect(await startCase.served('Page.vue', 'client')).not.toContain(
      'MARK_SERVER_SECRET',
    )
  })
})

/**
 * A production build (`vite build`) whose Vue plugin keeps Vue's devtools
 * (`features.prodDevtools`): the template is not inlined, as in development.
 * `sfcs`: the SFCs by name (`src/<name>.vue`), all exported by the entry.
 */
const devtoolsBuild = (
  sfcs: Record<string, string>,
  registerCleanup?: (cleanup: () => Promise<void>) => void,
) =>
  buildStart({
    registerCleanup,
    framework: 'vue',
    files: {
      'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute()
`,
      'src/b.ts': builder,
      ...Object.fromEntries(
        Object.entries(sfcs).map(([name, sfc]) => [`src/${name}.vue`, sfc]),
      ),
      'src/entry.ts': Object.keys(sfcs)
        .map((name) => `export { default as ${name} } from './${name}.vue'\n`)
        .join(''),
    },
    entry: 'src/entry.ts',
    viteConfig: { plugins: [vue({ features: { prodDevtools: true } })] },
  })

describe('vite build with Vue devtools', () => {
  test.each([
    { name: '<script setup>', lang: undefined },
    { name: '<script setup lang="ts">', lang: 'ts' as const },
  ])(
    'a template attaching a handler to a builder a $name block hands it fails the build',
    async ({ lang }) => {
      const outcome = await devtoolsBuild({ Page: templateHandler(lang) }).then(
        (build) => build.client.where('MARK_SERVER_SECRET'),
        (error: unknown) => error,
      )
      expect(outcome).toBeInstanceOf(StartBuildError)
    },
    60_000,
  )

  // (one build of every recipe, each with its own marker)
  const marked = recipes.map((recipe, i) => ({
    ...recipe,
    mark: `MARK_RECIPE_${i}`,
    sfc: recipe.sfc.replaceAll('MARK_SERVER_SECRET', `MARK_RECIPE_${i}`),
  }))
  let recipeBuild: ReturnType<typeof devtoolsBuild> | undefined
  let disposeRecipeBuild: (() => Promise<void>) | undefined
  afterAll(() => disposeRecipeBuild?.())
  test.each(marked)(
    '$name builds, and no server code reaches the client',
    async ({ mark }) => {
      recipeBuild ??= devtoolsBuild(
        Object.fromEntries(marked.map(({ sfc }, i) => [`Recipe${i}`, sfc])),
        (cleanup) => {
          disposeRecipeBuild = cleanup
        },
      )
      expect((await recipeBuild).client.where(mark)).toBe('nowhere')
    },
    60_000,
  )
})
