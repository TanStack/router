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
 * - `errorComponent: Oops` of a route whose loader throws: the router gives
 *   the error component its props (the error), and the suggested wrapper
 *   passes them on (Astra review of #8817, hydrate #7: the wrapper dropped
 *   the props, and the error component read `undefined.message`).
 * Applied, each fix builds with no violation, the server renders the
 * fallback, and the browser hydrates the chart, which responds to a click,
 * or the error component, which shows the route's error.
 * Production builds on Vite and Rsbuild with import protection on, served
 * as each bundler's preview serves them, in a browser.
 * Source: fact-check of the Astra review round 4 of #8817, import
 * protection N1, B1 and B2.
 */
import { describe, expect, test } from 'vitest'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { openTestPage } from '../../test-page'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import { createStartHost } from '../../start-host'
import { rejection } from '../../importProtection/start-apps'
import { rsbuildEntries } from '../route-css-cases'
import type { StartBundler } from '../../build-harness'

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

/** A browser-only error component: it shows the error the router gives it. */
const oops = `import type { ErrorComponentProps } from '@tanstack/react-router'
export function Oops({ error }: ErrorComponentProps) {
  return <p data-testid="oops">{window.location.pathname}: {error.message}</p>
}
`

/** The route files: path → the import, the option (`component` unless named) and its value. */
const routes: Record<
  string,
  { imports: string; value: string; option?: 'errorComponent' }
> = {
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
  error: {
    imports: `import { Oops } from '../oops.client'`,
    value: 'Oops',
    option: 'errorComponent',
  },
}

/** A route file; `option` is the option's text, `key: value`. */
const routeFile = (name: string, between: string, option: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
${routes[name]!.imports}
${between}export const Route = createFileRoute('/${name}')({${
    routes[name]!.option === 'errorComponent'
      ? ` loader: () => {
    throw new Error('MARK_LOADER_ERROR')
  },`
      : ''
  } ${option} })
`

const app = (route: (name: string) => string) => ({
  'src/routes/__root.tsx': root,
  'src/chart.client.tsx': chart,
  'src/oops.client.tsx': oops,
  ...Object.fromEntries(
    Object.keys(routes).map((name) => [`src/routes/${name}.tsx`, route(name)]),
  ),
})

/** What the report of a failed build gives for a route's option: a declaration to add, the option, and its value. */
interface PrintedFix {
  declaration: string | null
  option: string
  value: string
}

/** The fixes the reports print, by route file (`src/routes/<name>.tsx`). */
function printedFixes(error: {
  diagnostics: Array<{ text: string }>
}): Map<string, PrintedFix> {
  const fixes = new Map<string, PrintedFix>()
  for (const { text } of error.diagnostics) {
    for (const found of text.matchAll(
      /The route option (\w+): .*? renders it on the server \((src\/routes\/[\w-]+\.tsx):\d+:\d+\): write (?:(const \w+ = .+?) after the imports, and )?(\w+): (\(props\) => <ClientOnly fallback=\{\.\.\.\}>.*?<\/ClientOnly>) \(ClientOnly from @tanstack\/react-router\)/g,
    )) {
      fixes.set(found[2]!, {
        declaration: found[3] ?? null,
        option: found[4]!,
        value: found[5]!,
      })
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
    const host = await closeAtEnd(() =>
      createStartHost({
        serve: false,
        files,
        start: { importProtection: { enabled: true } },
      }),
    )
    return (await host.preview()).url
  }
  const build = await buildStart({
    bundler,
    files: { ...rsbuildEntries, ...files },
  })
  expect(build.violations).toEqual([])
  return (await build.preview()).url
}

describe.each(startBundlers)('%s build', (bundler) => {
  test("the <ClientOnly> fix a report prints for a route file's component option, applied as written, hydrates the chart (or the error component, with the route's error)", async () => {
    const error = await rejection(
      buildStart({
        bundler,
        files: {
          ...rsbuildEntries,
          ...app((name) =>
            routeFile(
              name,
              '',
              `${routes[name]!.option ?? 'component'}: ${routes[name]!.value}`,
            ),
          ),
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
          `${fix.option}: ${fix.value.replace(
            'fallback={...}',
            'fallback={<i data-testid="fallback">Waiting</i>}',
          )}`,
        )
      }),
    )
    for (const name of Object.keys(routes)) {
      const href = new URL(`/${name}`, url).href
      const html = await (await fetch(href)).text()
      expect(html, name).toContain('data-testid="fallback"')
      expect(html, name).not.toContain('data-testid="chart"')
      expect(html, name).not.toContain('data-testid="oops"')
      const page = await openTestPage(href)
      await page.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      if (routes[name]!.option === 'errorComponent') {
        await page.waitForText(`/${name}: MARK_LOADER_ERROR`, {
          selector: '[data-testid=oops]',
        })
        continue
      }
      await page.waitForText(`/${name} chart 0`, {
        selector: '[data-testid=chart]',
      })
      await page.page.locator('[data-testid=chart]').click()
      await page.waitForText(`/${name} chart 1`, {
        selector: '[data-testid=chart]',
      })
    }
  })
})
