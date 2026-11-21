/**
 * The fix an import-protection report suggests for a browser-only
 * (`*.client.*`) component a route file's `component` option renders on
 * the server, read from the printed report (the code it gives, not its
 * wording) and applied as written (R101: the fix a message gives works).
 * The route is code-split as an app's routes are: the server reports the
 * route's split module, where the option's value is generated code. Each
 * value is one a route can name a component by:
 * - `Chart`: the report gave function fixes only, no `<ClientOnly>`;
 * - `chart`, a lowercase binding: the report wrote `<chart {...props} />`,
 *   which builds and renders an empty `<chart>` element;
 * - `Screens['chart-panel']`, `Screens?.['chart-panel']` and `UI?.Chart`:
 *   the report wrote them as JSX tag names, which does not parse (or
 *   drops the optional chain).
 * Applied, each fix builds with no violation, the server renders the
 * fallback, and the browser hydrates the chart, which responds to a click.
 * Production builds on Vite and Rsbuild with import protection on, served
 * as each bundler's preview serves them, in a browser.
 * Source: fact-check of the Astra review round 4 of #8817, import
 * protection N1, B1 and B2.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { buildStart, startBundlers } from '../../build-harness'
import { createStartHost } from '../../start-host'
import { rejection } from '../../importProtection/start-apps'
import { rsbuildEntries } from '../route-css-cases'
import type { StartBundler } from '../../build-harness'

const timeout = 120_000

const root = `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`

/** A browser-only chart (it reads `window` while rendering), also exported under a string name. */
const chart = `import { useState } from 'react'
export function Chart() {
  const [clicks, setClicks] = useState(0)
  return (
    <button data-testid="chart" onClick={() => setClicks(clicks + 1)}>
      {window.location.pathname} chart {clicks}
    </button>
  )
}
export { Chart as 'chart-panel' }
`

/** The route files: path → the import and the option's value. */
const routes = {
  named: { imports: `import { Chart } from '../chart.client'`, value: 'Chart' },
  lower: {
    imports: `import { Chart as chart } from '../chart.client'`,
    value: 'chart',
  },
  computed: {
    imports: `import * as Screens from '../chart.client'`,
    value: `Screens['chart-panel']`,
  },
  'optional-computed': {
    imports: `import * as Screens from '../chart.client'`,
    value: `Screens?.['chart-panel']`,
  },
  'optional-member': {
    imports: `import * as UI from '../chart.client'`,
    value: 'UI?.Chart',
  },
}
type RouteName = keyof typeof routes

const routeFile = (name: RouteName, between: string, value: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
${routes[name].imports}
${between}export const Route = createFileRoute('/${name}')({ component: ${value} })
`

const app = (route: (name: RouteName) => string) => ({
  'src/routes/__root.tsx': root,
  'src/chart.client.tsx': chart,
  ...Object.fromEntries(
    Object.keys(routes).map((name) => [
      `src/routes/${name}.tsx`,
      route(name as RouteName),
    ]),
  ),
})

/** What the report of a failed build gives for a route's option: a declaration to add, and the option's value. */
interface PrintedFix {
  declaration: string | null
  value: string
}

/** The fixes the reports print, by route file (`src/routes/<name>.tsx`). */
function printedFixes(error: {
  diagnostics: Array<{ text: string }>
}): Map<string, PrintedFix> {
  const fixes = new Map<string, PrintedFix>()
  for (const { text } of error.diagnostics) {
    for (const found of text.matchAll(
      /The route option component: .*? renders it on the server \((src\/routes\/[\w-]+\.tsx):\d+:\d+\): write (?:(const \w+ = .+?) after the imports, and )?component: (\(props\) => <ClientOnly fallback=\{\.\.\.\}>.*?<\/ClientOnly>) \(ClientOnly from @tanstack\/react-router\)/g,
    )) {
      fixes.set(found[1]!, { declaration: found[2] ?? null, value: found[3]! })
    }
  }
  return fixes
}

/** Builds the app with the printed fixes, and the URL its preview serves. */
async function previewFixed(
  bundler: StartBundler,
  files: Record<string, string>,
) {
  if (bundler === 'vite') {
    const host = await createStartHost({
      serve: false,
      files,
      start: { importProtection: { enabled: true } },
    })
    onTestFinished(() => host.close())
    return (await host.preview()).url
  }
  const build = await buildStart({
    bundler,
    files: { ...rsbuildEntries, ...files },
  })
  expect(build.violations).toEqual([])
  return (await build.preview(onTestFinished)).url
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    "the <ClientOnly> fix a report prints for a route file's component option, applied as written, hydrates the chart",
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...rsbuildEntries,
            ...app((name) => routeFile(name, '', routes[name].value)),
          },
        }),
      )
      const fixes = printedFixes(error)
      expect([...fixes.keys()].sort()).toEqual(
        Object.keys(routes)
          .map((name) => `src/routes/${name}.tsx`)
          .sort(),
      )
      const url = await previewFixed(
        bundler,
        app((name) => {
          const fix = fixes.get(`src/routes/${name}.tsx`)!
          return routeFile(
            name,
            `import { ClientOnly } from '@tanstack/react-router'\n${fix.declaration ? `${fix.declaration}\n` : ''}`,
            fix.value.replace(
              'fallback={...}',
              'fallback={<i data-testid="fallback">Waiting</i>}',
            ),
          )
        }),
      )
      for (const name of Object.keys(routes)) {
        const href = new URL(`/${name}`, url).href
        const html = await (await fetch(href)).text()
        expect(html, name).toContain('data-testid="fallback"')
        expect(html, name).not.toContain('data-testid="chart"')
        const page = await openPage(href, { registerCleanup: onTestFinished })
        await page.waitForText('hydrated', {
          selector: '[data-testid=hydrated]',
        })
        await page.waitForText(`/${name} chart 0`, {
          selector: '[data-testid=chart]',
        })
        await page.page.locator('[data-testid=chart]').click()
        await page.waitForText(`/${name} chart 1`, {
          selector: '[data-testid=chart]',
        })
      }
    },
    timeout,
  )
})
