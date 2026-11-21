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
 * as each bundler's preview serves them, in a browser.
 * Source: Astra review of #8817, import protection B2 and B4.
 */
import vue from '@vitejs/plugin-vue'
import { pluginVue } from '@rsbuild/plugin-vue'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { diagnosticPosition } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../../build-harness'
import { createStartHost } from '../../start-host'
import {
  expectViolationsAt,
  rejection,
} from '../../importProtection/start-apps'
import type { StartBundler } from '../../build-harness'

const timeout = 90_000

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
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/vue-router'
import Page from '../Page.vue'
export const Route = createFileRoute('/')({ component: Page })
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

/** The fix the report of a failed build gives: its declaration, and the component's name. */
function printedFix(error: { diagnostics: Array<{ text: string }> }) {
  const found = error.diagnostics
    .map(({ text }) =>
      /const (\w+) = (defineAsyncComponent\(createClientOnlyFn\(.*?\)\)) in the script/.exec(
        text,
      ),
    )
    .find((m) => m !== null)
  expect(found, 'a report with the defineAsyncComponent fix').toBeTruthy()
  return {
    name: found![1]!,
    declaration: found![0].replace(/ in the script$/, ''),
  }
}

/** `Page.vue` with the fix applied as the report gives it. */
const fixedPage = ({ name, declaration }: ReturnType<typeof printedFix>) =>
  `<script setup>
import { defineAsyncComponent } from 'vue'
import { createClientOnlyFn } from '@tanstack/vue-start'
import { ClientOnly } from '@tanstack/vue-router'
${declaration}
</script>
<template><main><ClientOnly><${name} /></ClientOnly></main></template>
`

/** Builds `files` (with the fix) for production, and opens its page `/`. */
async function openFixedApp(
  bundler: StartBundler,
  files: Record<string, string>,
) {
  let url: string
  if (bundler === 'vite') {
    const host = await createStartHost({
      framework: 'vue',
      serve: false,
      files: { ...app, ...files },
      start: { importProtection: { enabled: true } },
    })
    onTestFinished(() => host.close())
    url = (await host.preview()).url
  } else {
    const build = await buildStart({
      bundler,
      framework: 'vue',
      files: { ...rsbuildEntries, ...app, ...files },
      ...bundlerConfig(bundler),
    })
    expect(build.violations).toEqual([])
    url = (await build.preview()).url
  }
  return openPage(new URL('/', url).href, { registerCleanup: onTestFinished })
}

const buildFailure = (bundler: StartBundler, files: Record<string, string>) =>
  rejection(
    buildStart({
      bundler,
      framework: 'vue',
      files: { ...rsbuildEntries, ...app, ...files },
      ...bundlerConfig(bundler),
    }),
  )

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    "the fix of a named import of a *.client.* component hydrates that component, not the module's default",
    async () => {
      const ui = `import { defineComponent, h } from 'vue'
export const Chart = defineComponent({ setup: () => () => h('b', { id: 'chart' }, 'VISIBLE CHART') })
export default defineComponent({ setup: () => () => h('i', { id: 'other' }, 'DIFFERENT WIDGET') })
`
      const page = `<script setup>
import { Chart } from './ui.client'
</script>
<template><main><Chart /></main></template>
`
      const error = await buildFailure(bundler, {
        'src/ui.client.ts': ui,
        'src/Page.vue': page,
      })
      const { line, column } = diagnosticPosition(page, "'./ui.client'")
      expectViolationsAt(error, [
        { environment: 'server', use: `src/Page.vue:${line}:${column}` },
      ])
      const browser = await openFixedApp(bundler, {
        'src/ui.client.ts': ui,
        'src/Page.vue': fixedPage(printedFix(error)),
      })
      await browser.waitForText('VISIBLE CHART', { selector: '#chart' })
      expect(await browser.text('main')).not.toContain('DIFFERENT WIDGET')
    },
    timeout,
  )

  test(
    'a client-only SFC imported by hand is reported at its importer, and the fix hydrates it',
    async () => {
      const chart = `<script setup>
// a chart that draws in the browser
import '@tanstack/vue-start/client-only'
</script>
<template><b id="chart">VISIBLE CHART</b></template>
`
      const error = await buildFailure(bundler, {
        'src/Chart.vue': chart,
        'src/Page.vue': `<script setup>
import Chart from './Chart.vue'
</script>
<template><main><Chart /></main></template>
`,
      })
      expectViolationsAt(error, [
        { environment: 'server', use: 'src/Page.vue' },
      ])
      const browser = await openFixedApp(bundler, {
        'src/Chart.vue': chart,
        'src/Page.vue': fixedPage(printedFix(error)),
      })
      await browser.waitForText('VISIBLE CHART', { selector: '#chart' })
    },
    timeout,
  )
})
