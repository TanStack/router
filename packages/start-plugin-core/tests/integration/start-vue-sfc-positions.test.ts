/**
 * Where the refusals of a Vue SFC's `<script setup>` block are reported
 * (SPEC §5.7: the user's file and position): the line and column in the
 * SFC, and no other position, in a production build and on the dev server
 * of Vite (`@vitejs/plugin-vue`) and Rsbuild (`@rsbuild/plugin-vue`). The
 * plugins compile the block into the component's setup function, so a
 * server fn there is nested in a function; a production build's plugin
 * makes no source map. The fixes the messages give build, with the
 * handler on the server only.
 */
import vue from '@vitejs/plugin-vue'
import { pluginVue } from '@rsbuild/plugin-vue'
import { afterAll, describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart } from '../build-harness'
import { clientPage, startRsbuildStartDevServer } from '../rsbuild-dev-server'
import { compileError, createStartHost } from '../regression-helpers'
import type { StartHost } from '../regression-helpers'

const timeout = 120_000

/** An SFC whose `<script setup>` block (after its template) holds `setup`; `pre`: text the template shows. */
const sfc = (setup: string, pre = '') => `<template>
  <p>page</p>${pre ? `\n  <pre>${pre}</pre>` : ''}
</template>

<!-- the script -->
<script setup lang="ts">
import { createServerFn } from '@tanstack/vue-start'
${setup}
defineExpose({ getX })
</script>
`

/** Refused SFCs, with the text the refusal points at. */
const refused = [
  {
    name: 'a server fn built on a builder the block keeps in a const',
    // (the template is handed `base` too, in development: refused at its
    // declaration, two lines up)
    sfc: sfc(`const base = createServerFn()
const label = 'page'
const getX = base.handler(async () => 'MARK_SERVER_SECRET')`),
    at: 'base.handler',
  },
  {
    name: 'a server fn reading the props',
    sfc: sfc(`const props = defineProps<{ t?: string }>()
const getX = createServerFn().handler(async () => 'MARK_SERVER_SECRET' + props.t)`),
    at: 'props.t',
  },
]

/**
 * Refused in development only: a JavaScript block hands its imports to the
 * template through generated code; refused at the import.
 */
const refusedInDev = [
  {
    name: 'a factory a JavaScript block imports',
    sfc: `<template>
  <p>page</p>
</template>

<script setup>
import { createServerFn } from '@tanstack/vue-start'
const getX = createServerFn().handler(async () => 'MARK_SERVER_SECRET')
defineExpose({ getX })
</script>
`,
    at: 'createServerFn }',
  },
  {
    name: 'a builder a <script> block next to <script setup> keeps in a const',
    sfc: `<template>
  <p>page</p>
</template>

<script lang="ts">
import { createServerFn } from '@tanstack/vue-start'
const base = createServerFn()
export const getX = base.handler(async () => 'MARK_SERVER_SECRET')
</script>

<script setup lang="ts">
defineExpose({ getX })
</script>
`,
    at: 'base = createServerFn',
  },
]

/** The fixes the refusals give: one chain; the value passed in the input. */
const fixes = [
  {
    name: 'one chain',
    sfc: sfc(
      `const getX = createServerFn().handler(async () => 'MARK_FIX_CHAIN')`,
    ),
    mark: 'MARK_FIX_CHAIN',
  },
  {
    name: 'the props passed in the input',
    sfc: sfc(`const props = defineProps<{ t?: string }>()
const getX0 = createServerFn()
  .validator((t?: string) => t)
  .handler(async ({ data }) => 'MARK_FIX_INPUT' + data)
const getX = () => getX0({ data: props.t })`),
    mark: 'MARK_FIX_INPUT',
  },
]

/** Asserts that `diagnostics` report the refusal of `row` in `file` at its position, and at no position a line away. */
function expectAtRefusal(
  diagnostics: unknown,
  file: string,
  row: (typeof refused)[number],
  root?: string,
) {
  const { line, column } = diagnosticPosition(row.sfc, row.at)
  expectDiagnostic(diagnostics, {
    severity: 'error',
    file,
    root,
    position: { line, column },
  })
  for (const other of [line - 1, line + 1]) {
    expect(
      findDiagnostics(diagnostics, {
        severity: 'error',
        file,
        root,
        position: { line: other },
      }),
      `a diagnostic at line ${other}`,
    ).toEqual([])
  }
}

const root = `import { createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute()
`

/** A production build of `sfcs` (`src/<name>.vue`) with `bundler`, with source maps or not (the Vue plugins map the script only then). */
const build = (
  bundler: 'vite' | 'rsbuild',
  sfcs: Record<string, string>,
  sourcemap = false,
) =>
  buildStart({
    bundler,
    sourcemap,
    framework: 'vue',
    files: {
      'src/routes/__root.tsx': root,
      ...Object.fromEntries(
        Object.entries(sfcs).map(([name, text]) => [`src/${name}.vue`, text]),
      ),
      'src/entry.ts': Object.keys(sfcs)
        .map((name) => `export { default as ${name} } from './${name}.vue'\n`)
        .join(''),
    },
    entry: 'src/entry.ts',
    ...(bundler === 'vite'
      ? { viteConfig: { plugins: [vue()] } }
      : { rsbuildConfig: { plugins: [pluginVue()] } }),
  })

describe.each([
  { bundler: 'vite', sourcemap: false },
  { bundler: 'vite', sourcemap: true },
  { bundler: 'rsbuild', sourcemap: false },
  { bundler: 'rsbuild', sourcemap: true },
] as const)(
  '$bundler build, source maps $sourcemap',
  ({ bundler, sourcemap }) => {
    test.each(refused)(
      '$name fails the build at its position in the SFC',
      async (row) => {
        const error = await build(bundler, { Page: row.sfc }, sourcemap).then(
          () => expect.fail('the build succeeded'),
          (e: unknown) => e,
        )
        if (!(error instanceof StartBuildError)) {
          throw error
        }
        expectAtRefusal(error.diagnostics, 'src/Page.vue', row, error.root)
      },
      timeout,
    )

    // Without a map, the statement's line is found by its text: text on two
    // lines is no position, not either of them
    test(
      'a refused statement whose text the template shows too fails the build at no other line',
      async () => {
        const statement = `const getX = base.handler(async () => 'MARK_SERVER_SECRET')`
        const text = sfc(
          `const base = createServerFn()\n${statement}`,
          statement,
        )
        const error = await build(bundler, { Page: text }, sourcemap).then(
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
        })
        const template = diagnosticPosition(text, statement).line
        expect(
          findDiagnostics(error.diagnostics, {
            severity: 'error',
            file: 'src/Page.vue',
            root: error.root,
            position: { line: template },
          }),
        ).toEqual([])
      },
      timeout,
    )

    test(
      'the fixes build, and their handlers stay on the server',
      async () => {
        const built = await build(
          bundler,
          Object.fromEntries(fixes.map((fix, i) => [`Fix${i}`, fix.sfc])),
        )
        for (const { mark } of fixes) {
          expect(built.client.where(mark), mark).toBe('nowhere')
        }
      },
      timeout,
    )
  },
)

describe('vite dev', () => {
  const hosts: Array<StartHost> = []
  afterAll(async () => {
    for (const host of hosts) {
      await host.close()
    }
  })
  let devHost: Promise<StartHost> | undefined
  const sfcCase = async (text: string) => {
    devHost ??= createStartHost({ framework: 'vue' }).then((host) => {
      hosts.push(host)
      return host
    })
    return (await devHost).case({
      'Page.vue': text,
      'module.ts': `export { default } from './Page.vue'\n`,
    })
  }

  test.each([...refused, ...refusedInDev])(
    '$name is refused at its position in the SFC',
    async (row) => {
      const startCase = await sfcCase(row.sfc)
      const failure = await compileError(startCase, 'client', 'Page.vue')
      expect(failure).toBeInstanceOf(Error)
      expectAtRefusal(
        [...diagnosticsOf(failure!.error), ...failure!.reported],
        startCase.file('Page.vue'),
        row,
      )
    },
    timeout,
  )

  test.each(fixes)(
    '$name compiles',
    async ({ sfc: text, mark }) => {
      const startCase = await sfcCase(text)
      expect(
        await compileError(startCase, 'client', 'Page.vue'),
      ).toBeUndefined()
      expect(await startCase.served('Page.vue', 'client')).not.toContain(mark)
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  test(
    'each refusal is at its position in the SFC, and the fixes compile',
    async () => {
      const files = {
        ...Object.fromEntries(
          [...refused, ...refusedInDev].map((row, i) => [
            `src/Refused${i}.vue`,
            row.sfc,
          ]),
        ),
        ...Object.fromEntries(
          fixes.map((fix, i) => [`src/Fix${i}.vue`, fix.sfc]),
        ),
      }
      const server = await startRsbuildStartDevServer({
        ...clientPage,
        framework: 'vue',
        registerCleanup: (cleanup) => {
          afterAll(cleanup)
        },
        config: { plugins: [pluginVue()] },
        files: {
          'src/routes/__root.tsx': root,
          ...files,
          // (the refused blocks only behind an import the page never runs)
          'src/entry.ts': `${fixes.map((_, i) => `import Fix${i} from './Fix${i}.vue'\n`).join('')}globalThis.__fixes = [${fixes.map((_, i) => `Fix${i}`).join(', ')}]
globalThis.__refused = () => [${[...refused, ...refusedInDev].map((_, i) => `import('./Refused${i}.vue')`).join(', ')}]
`,
        },
      })
      for (const [i, row] of [...refused, ...refusedInDev].entries()) {
        expectAtRefusal(
          server.diagnostics,
          `src/Refused${i}.vue`,
          row,
          server.root,
        )
      }
      for (const [i] of fixes.entries()) {
        expect(
          findDiagnostics(server.diagnostics, {
            severity: 'error',
            file: `src/Fix${i}.vue`,
            root: server.root,
          }),
        ).toEqual([])
      }
    },
    timeout,
  )
})
