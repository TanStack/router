/**
 * Vue's `<script setup>` on a real Vite dev server (`@vitejs/plugin-vue`,
 * `tanstackStart()` of `@tanstack/vue-start`).
 *
 * On main, the SFC is a compile error there (the overlay, the build); no server
 * code ships.
 */
import vue from '@vitejs/plugin-vue'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { closeAfterAll } from '../file-end'
import { StartBuildError } from '../build-harness'
import { buildStart } from '../build-start'
import {
  compileError,
  createStartHost,
  expectCompileError,
} from '../regression-helpers'
import type { StartHost } from '../regression-helpers'

const builder = `import { createServerFn } from '@tanstack/vue-start'
export const base = createServerFn()
export const label = 'x'
`

/** One dev host for the cases of this file (each case is its own module). */
let devHost: Promise<StartHost> | undefined
const vueHost = () =>
  (devHost ??= openDevHost(() => createStartHost({ framework: 'vue' })))
const openDevHost = closeAfterAll()

/** A component whose `<script setup>` block is `script`. */
const sfcOf = (script: string) => `<script setup>
${script}
</script>

<template>
  <p>page</p>
</template>
`

async function caseOf(script: string) {
  return (await vueHost()).case({
    'b.ts': builder,
    'Page.vue': sfcOf(script),
    'module.ts': `export { default } from './Page.vue'\n`,
  })
}

test.fails.each([
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
    at: 'createServerFn } }',
    names: 'createServerFn',
  },
  {
    name: 'an object of the block holding a builder',
    script: `import { base } from './b'
const own = { base }
console.log(own)`,
    at: 'base }\nconsole.log(own)',
    names: 'base',
  },
  {
    name: 'an object of the block named like the generated one',
    script: `import { base } from './b'
const nested = () => {
  const returned = { base }
  return returned
}
console.log(nested)`,
    at: 'base }\n  return returned',
    names: 'base',
  },
])('$name is refused', async ({ script, at, names }) => {
  const startCase = await caseOf(script)
  const failure = await compileError(startCase, 'client', 'Page.vue')
  expect(failure, 'a compile error').toBeInstanceOf(Error)
  // an error at the use in the SFC (line and column), naming what it refuses
  const refusal = expectDiagnostic(
    [...diagnosticsOf(failure!.error), ...failure!.reported],
    {
      severity: 'error',
      file: failure!.file,
      position: diagnosticPosition(sfcOf(script), at),
    },
  )
  expect(refusal.text, 'the refusal names the binding').toContain(
    `\`${names}\``,
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

/** The recipe: TypeScript blocks, builders and server fns at the module top level. */
const recipes = [
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

/** A component whose two-line `script` declares `impl`, which the block passes to a server-only fn (line 5 of the file). */
const reassignedSfc = (
  lang: 'ts' | undefined,
  script: string,
  template: string,
) => `<script setup${lang ? ` lang="${lang}"` : ''}>
import { createServerOnlyFn } from '@tanstack/vue-start'
${script}
const read = createServerOnlyFn(impl)
console.log(read)
</script>

<template>
  ${template}
</template>
`

async function sfcCase(sfc: string) {
  return (await vueHost()).case({
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
      const source = templateHandler(lang)
      const startCase = await sfcCase(source)
      expectCompileError(await compileError(startCase, 'client', 'Page.vue'), {
        source,
        at: `import { base } from './b'`,
      })
    },
  )

  // a `let` of the block is a local of the setup function: the server fn is
  // refused for where it is created, with the block's own message, also when
  // the block assigns the handler again (not the module-level reassignment
  // error, whose rewrite would leave it in the block)
  test('a server fn on a reassigned `let` of a <script setup> block keeps the script-setup message', async () => {
    const startCase = await sfcCase(`<script setup>
import { createServerFn } from '@tanstack/vue-start'
let h = async () => 'MARK_SERVER_SECRET'
h = async () => 'MARK_SERVER_SECRET_2'
const fn = createServerFn().handler(h)
console.log(fn)
</script>

<template>
  <p>page</p>
</template>
`)
    const failure = await compileError(startCase, 'client', 'Page.vue')
    expect(failure).toBeInstanceOf(Error)
    const texts = [
      ...diagnosticsOf(failure!.error),
      ...diagnosticsOf(failure!.reported),
    ]
      .map((d) => d.text)
      .join('\n')
    expect(texts).toContain('created each time a component is set up')
    expect(texts).not.toContain('assigned elsewhere')
  })

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
const devtoolsBuild = (sfcs: Record<string, string>) =>
  buildStart({
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
  test.each(marked)(
    '$name builds, and no server code reaches the client',
    async ({ mark }) => {
      recipeBuild ??= devtoolsBuild(
        Object.fromEntries(marked.map(({ sfc }, i) => [`Recipe${i}`, sfc])),
      )
      expect((await recipeBuild).client.where(mark)).toBe('nowhere')
    },
    60_000,
  )
})

/**
 * A production build without devtools: Vue inlines the template in the
 * setup function, which reads only what the template renders.
 */
describe('vite build', () => {
  const build = (sfc: string) =>
    buildStart({
      framework: 'vue',
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute()
`,
        'src/Page.vue': sfc,
        'src/entry.ts': `export { default as Page } from './Page.vue'\n`,
      },
      entry: 'src/entry.ts',
      viteConfig: { plugins: [vue()] },
    })

  test('a server-only fn on a `let` the block assigns again fails the build at the argument', async () => {
    const error = await build(
      reassignedSfc(
        'ts',
        `let impl = (): string => 'MARK_SERVER_SECRET'
impl = (): string => 'MARK_SERVER_SECRET_2'`,
        '<p>page</p>',
      ),
    ).then(
      () => expect.fail('the build succeeded'),
      (e: unknown) => e,
    )
    if (!(error instanceof StartBuildError)) {
      throw error
    }
    expectDiagnostic(error.diagnostics, {
      severity: 'error',
      file: 'src/Page.vue',
      root: error.root,
      position: { line: 5 },
    })
  }, 60_000)
})
