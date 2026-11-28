/**
 * The fix an import-protection report suggests for a browser-only component
 * a Vue SFC's template renders on the server, applied as written (R101: the
 * fix a message gives works): the report's
 * `const X = defineAsyncComponent(createClientOnlyFn(() => import(...)))`,
 * read from the printed report (the code it gives, not its wording), with
 * `<ClientOnly><X /></ClientOnly>` in the template, builds and hydrates the
 * component the SFC imported:
 * - a named export of a `*.client.*` module whose default export is another
 *   component (the fix loaded the default);
 * - an SFC marked client-only (`@tanstack/vue-start/client-only`) that
 *   another SFC imports by hand, reported at that importer (Rsbuild named
 *   the marked SFC itself; both said another plugin added the import).
 * Production builds on Vite and Rsbuild with import protection on, served
 * as each bundler's preview serves them, in a browser; both cases are
 * routes of one app, built failing once and fixed once.
 * Source: Astra review of #8817, import protection B2 and B4.
 */
import vue from '@vitejs/plugin-vue'
import { pluginVue } from '@rsbuild/plugin-vue'
import { afterAll, describe, expect, test } from 'vitest'
import { diagnosticPosition } from '@tanstack/compiler-test-utils/diagnostics'
import { openTestPage } from '../../test-page'
import { buildStartShared, startBundlers } from '../../build-harness'
import { createStartHost } from '../../start-host'
import {
  expectViolationsAt,
  locationParts,
  rejection,
  reportedViolations,
} from '../../importProtection/start-apps'
import type { StartBuildError, StartBundler } from '../../build-harness'

const timeout = 90_000

/** The two cases' pages: a route each (`/named`, `/marked`). */
const app = {
  'src/routes/__root.tsx': `import { defineComponent, h } from 'vue'
import { Body, HeadContent, Html, Outlet, Scripts, createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute({
  component: defineComponent({
    setup: () => () =>
      h(Html, {}, () => [h('head', [h(HeadContent)]), h(Body, {}, () => [h(Outlet), h(Scripts)])]),
  }),
})
`,
  'src/routes/named.tsx': `import { createFileRoute } from '@tanstack/vue-router'
import Page from '../Named.vue'
export const Route = createFileRoute('/named')({ component: Page })
`,
  'src/routes/marked.tsx': `import { createFileRoute } from '@tanstack/vue-router'
import Page from '../Marked.vue'
export const Route = createFileRoute('/marked')({ component: Page })
`,
}

/** The Rsbuild app's own entries: the harness's client entry hydrates nothing. */
const rsbuildEntries = {
  'src/client.ts': `import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'
hydrateStart().then((router) => {
  createSSRApp(StartClient, { router }).mount('#__app')
})
`,
  'src/server.ts': `export { default } from '@tanstack/vue-start/server-entry'\n`,
}

const bundlerConfig = (bundler: StartBundler) =>
  bundler === 'vite'
    ? { viteConfig: { plugins: [vue()] } }
    : { rsbuildConfig: { plugins: [pluginVue()] } }

/**
 * A named export of a `*.client.*` module whose default export is another
 * component (the fix loaded the default), used by `src/Named.vue`.
 */
const ui = `import { defineComponent, h } from 'vue'
export const Chart = defineComponent({ setup: () => () => h('b', { id: 'chart' }, 'VISIBLE CHART') })
export default defineComponent({ setup: () => () => h('i', { id: 'other' }, 'DIFFERENT WIDGET') })
`
const named = `<script setup>
import { Chart } from './ui.client'
</script>
<template><main><Chart /></main></template>
`

/** An SFC marked client-only that `src/Marked.vue` imports by hand. */
const chart = `<script setup>
// a chart that draws in the browser
import '@tanstack/vue-start/client-only'
</script>
<template><b id="marked-chart">MARKED CHART</b></template>
`
const marked = `<script setup>
import Chart from './Chart.vue'
</script>
<template><main><Chart /></main></template>
`

/**
 * The fix a report of the failed build gives for the import of `specifier`
 * (a build may print both cases' reports in one error): its declaration, and
 * the component's name.
 */
function printedFix(
  error: { diagnostics: Array<{ text: string }> },
  specifier: string,
) {
  const found = error.diagnostics
    .flatMap(({ text }) => [
      ...text.matchAll(
        /const (\w+) = (defineAsyncComponent\(createClientOnlyFn\(.*?\)\)) in the script/g,
      ),
    ])
    .find((m) => m[2]!.includes(`import('${specifier}')`))
  expect(
    found,
    `a report with the defineAsyncComponent fix of ${specifier}`,
  ).toBeTruthy()
  return {
    name: found![1]!,
    declaration: found![0].replace(/ in the script$/, ''),
  }
}

/** A page with the fix applied as the report gives it. */
const fixedPage = ({ name, declaration }: ReturnType<typeof printedFix>) =>
  `<script setup>
import { defineAsyncComponent } from 'vue'
import { createClientOnlyFn } from '@tanstack/vue-start'
import { ClientOnly } from '@tanstack/vue-router'
${declaration}
</script>
<template><main><ClientOnly><${name} /></ClientOnly></main></template>
`

/**
 * Builds `files` (with the fixes) for production: the URL its preview
 * serves, until `close()`.
 */
async function previewFixedApp(
  bundler: StartBundler,
  files: Record<string, string>,
) {
  if (bundler === 'vite') {
    const host = await createStartHost({
      framework: 'vue',
      serve: false,
      files: { ...app, ...files },
      start: { importProtection: { enabled: true } },
    })
    return { url: (await host.preview()).url, close: host.close }
  }
  const build = await buildStartShared({
    bundler,
    framework: 'vue',
    files: { ...rsbuildEntries, ...app, ...files },
    ...bundlerConfig(bundler),
  })
  expect(build.violations).toEqual([])
  return { url: (await build.preview()).url, close: build.close }
}

describe.each(startBundlers)('%s build', (bundler) => {
  // both cases in one app: the failed build, then the build with both
  // printed fixes applied (shared by the two rows, closed after the file)
  let built:
    | Promise<{
        error: StartBuildError
        url: string
        close: () => Promise<void>
      }>
    | undefined
  afterAll(() =>
    built?.then(
      (opened) => opened.close(),
      () => {},
    ),
  )
  const both = () =>
    (built ??= (async () => {
      const error = await rejection(
        buildStartShared({
          bundler,
          framework: 'vue',
          files: {
            ...rsbuildEntries,
            ...app,
            'src/ui.client.ts': ui,
            'src/Named.vue': named,
            'src/Chart.vue': chart,
            'src/Marked.vue': marked,
          },
          ...bundlerConfig(bundler),
        }),
      )
      const fixed = await previewFixedApp(bundler, {
        'src/ui.client.ts': ui,
        'src/Named.vue': fixedPage(printedFix(error, './ui.client')),
        'src/Chart.vue': chart,
        'src/Marked.vue': fixedPage(printedFix(error, './Chart.vue')),
      })
      return { error, ...fixed }
    })())
  /**
   * The violations of the failed build whose importer is `file`
   * (`reportedViolations`: root-relative, `/`-separated, one per violation).
   */
  const reportsOf = (error: StartBuildError, file: string) => {
    const importers = reportedViolations(error).map(
      ({ importer }) => locationParts(importer).file,
    )
    return {
      root: error.root,
      diagnostics: error.diagnostics,
      violations: error.violations.filter((_, i) => importers[i] === file),
    }
  }
  /** `file:line:column` of `needle` (the import's specifier) in `source`. */
  const importAt = (file: string, source: string, needle: string) => {
    const { line, column } = diagnosticPosition(source, needle)
    return `${file}:${line}:${column}`
  }
  const open = async (url: string, route: string) =>
    openTestPage(new URL(route, url).href)

  test(
    "the fix of a named import of a *.client.* component hydrates that component, not the module's default",
    async () => {
      const { error, url } = await both()
      expectViolationsAt(reportsOf(error, 'src/Named.vue'), [
        {
          environment: 'server',
          use: importAt('src/Named.vue', named, "'./ui.client'"),
        },
      ])
      const browser = await open(url, '/named')
      await browser.waitForText('VISIBLE CHART', { selector: '#chart' })
      expect(await browser.text('main')).not.toContain('DIFFERENT WIDGET')
      expect(await browser.text('main')).not.toContain('MARKED CHART')
    },
    timeout,
  )

  test(
    'a client-only SFC imported by hand is reported at its importer, and the fix hydrates it',
    async () => {
      const { error, url } = await both()
      // (located at the import that names the marked file)
      expectViolationsAt(reportsOf(error, 'src/Marked.vue'), [
        {
          environment: 'server',
          use: importAt('src/Marked.vue', marked, "'./Chart.vue'"),
        },
      ])
      const browser = await open(url, '/marked')
      await browser.waitForText('MARKED CHART', { selector: '#marked-chart' })
      expect(await browser.text('main')).not.toContain('VISIBLE CHART')
    },
    timeout,
  )

  // (an absence is a property of the whole build: the rows above read
  // their own importer's report)
  test(
    'the failed build reports both importers, and nothing else',
    async () => {
      const { error } = await both()
      // (every callback, duplicates kept: `expectViolationsAt` compares the
      // distinct ones)
      expect(
        reportedViolations(error)
          .map(
            ({ environment, importer }) =>
              `${environment} ${locationParts(importer).file}`,
          )
          .sort(),
      ).toEqual(['server src/Marked.vue', 'server src/Named.vue'])
      expectViolationsAt(error, [
        {
          environment: 'server',
          use: importAt('src/Named.vue', named, "'./ui.client'"),
        },
        {
          environment: 'server',
          use: importAt('src/Marked.vue', marked, "'./Chart.vue'"),
        },
      ])
    },
    timeout,
  )
})
