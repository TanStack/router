/**
 * The fixes an import-protection report suggests for a `'use client'`
 * component named `*.client.*` that a server component renders, for
 * rsc-use-client-fix-page*.test.ts. SSR renders a client component for the
 * page's HTML, so the server environment denies the browser-only file. The
 * report's fixes, read from the printed report (the paths and package it
 * gives, not its wording) and applied as written, build with import
 * protection's `error` behavior and work in a browser:
 * - renamed as the report gives it (without `.client`), SSR renders the
 *   component and its click works after hydration;
 * - rendered inside `<ClientOnly>` in another `'use client'` component,
 *   SSR renders the fallback and the browser the component, whose click
 *   works.
 * The report suggested `<ClientOnly>` at the server component's render
 * (which still fails the build) and, for a server component nested under
 * the chunk's entry (Vite), an import another plugin's transform added;
 * its Vite trace listed only framework and virtual modules, with NUL
 * bytes.
 *
 * Route `/c`: server fn `getC` renders `<Comp />` of `src/c/Comp.client.tsx`
 * itself. Route `/n`: server fn `getN` renders server component
 * `ServerChart`, which renders `<Comp />` of `src/n/Comp.client.tsx`.
 * Source: fact-check of the Astra review round 4 of #8817, import
 * protection B3, N2 and C1.
 */
import { expect } from 'vitest'
import { waitForHydration } from './rsc-app'
import type { Page } from '@tanstack/compiler-test-utils/test'

/** A `'use client'` button showing `MARK_OK` once clicked. */
const comp = `'use client'
import { useState } from 'react'
export function Comp() {
  const [value, setValue] = useState('')
  return <button data-testid="comp" onClick={() => setValue('MARK_OK')}>comp {value}</button>
}
`

const serverFn = (name: string, render: string, imports: string) =>
  `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
${imports}
export const ${name} = createServerFn().handler(() =>
  renderServerComponent(<div data-testid="root">${render}</div>),
)
`

const route = (
  path: string,
  fn: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { ${fn} } from '../${path}/page'
export const Route = createFileRoute('/${path}')({
  loader: async () => ({ tree: await ${fn}() }),
  component: Page,
})
function Page() {
  return <main data-testid="main">{Route.useLoaderData().tree}</main>
}
`

/** The app as written: both `Comp` files are `.client.tsx`. */
export const deniedApp: Record<string, string> = {
  'src/c/Comp.client.tsx': comp,
  'src/c/page.tsx': serverFn(
    'getC',
    'SERVER_ROOT <Comp />',
    `import { Comp } from './Comp.client'`,
  ),
  'src/routes/c.tsx': route('c', 'getC'),
  'src/n/Comp.client.tsx': comp,
  'src/n/ServerChart.tsx': `import { Comp } from './Comp.client'
export function ServerChart() {
  return <section>NESTED <Comp /></section>
}
`,
  'src/n/page.tsx': serverFn(
    'getN',
    'SERVER_ROOT <ServerChart />',
    `import { ServerChart } from './ServerChart'`,
  ),
  'src/routes/n.tsx': route('n', 'getN'),
}

/** The importer of each denied file: the server component rendering it. */
const renderedBy: Record<string, string> = {
  'src/c/Comp.client.tsx': 'src/c/page.tsx',
  'src/n/Comp.client.tsx': 'src/n/ServerChart.tsx',
}

/** The report's text: a failed Vite build's error, or each of a failed Rsbuild build's errors. */
export function reportOf(error: unknown): string {
  return error instanceof AggregateError
    ? error.errors
        .map((e: unknown) => (typeof e === 'string' ? e : String(e)))
        .join('\n')
    : String(error instanceof Error ? error.message : error)
}

/** The fixes the report prints: each rename (from → to), and the package of `<ClientOnly>` per denied file. */
export function printedFixes(report: string) {
  const renames = [
    ...report.matchAll(
      /if it can render there, rename (\S+) to (\S+) \(and the imports of it\)/g,
    ),
  ].map((m) => [m[1]!, m[2]!] as const)
  const clientOnly = [
    ...report.matchAll(
      /render it inside <ClientOnly fallback=\{\.\.\.\}> \(ClientOnly from (\S+)\) in another 'use client' component/g,
    ),
  ].map((m) => m[1]!)
  return { renames, clientOnly }
}

/** `deniedApp` with each file renamed as the report gives it, and the imports of it. */
export function renamedApp(
  renames: ReadonlyArray<readonly [string, string]>,
): Record<string, string> {
  const files = { ...deniedApp }
  for (const [from, to] of renames) {
    const content = files[from]!
    delete files[from]
    files[to] = content
    const importer = renderedBy[from]!
    const name = (file: string) =>
      `./${file
        .split('/')
        .pop()!
        .replace(/\.tsx$/, '')}`
    files[importer] = files[importer]!.replace(
      `'${name(from)}'`,
      `'${name(to)}'`,
    )
  }
  return files
}

/** `deniedApp` with each component rendered inside `<ClientOnly>` (of `pkg`) in a `'use client'` component its server component renders. */
export function clientOnlyApp(pkg: string): Record<string, string> {
  const files = { ...deniedApp }
  for (const [denied, importer] of Object.entries(renderedBy)) {
    const dir = denied.slice(0, denied.lastIndexOf('/'))
    files[`${dir}/CompClientOnly.tsx`] = `'use client'
import { ClientOnly } from '${pkg}'
import { Comp } from './Comp.client'
export function CompClientOnly() {
  return <ClientOnly fallback={<i data-testid="fallback">Waiting</i>}><Comp /></ClientOnly>
}
`
    files[importer] = files[importer]!.replace(
      `import { Comp } from './Comp.client'`,
      `import { CompClientOnly as Comp } from './CompClientOnly'`,
    )
  }
  return files
}

/** Each route's server-rendered HTML holds `ssr`, and after hydration its `Comp` responds to a click. */
export async function expectRoutesWork(
  url: string,
  open: (pathname: string) => Promise<Page>,
  ssr: 'component' | 'fallback',
): Promise<void> {
  for (const pathname of ['/c', '/n']) {
    const html = await (await fetch(new URL(pathname, url))).text()
    expect(html, pathname).toContain('SERVER_ROOT')
    if (ssr === 'component') {
      expect(html, pathname).toContain('data-testid="comp"')
    } else {
      expect(html, pathname).toContain('data-testid="fallback"')
      expect(html, pathname).not.toContain('data-testid="comp"')
    }
    const page = await open(pathname)
    await waitForHydration(page)
    await page.locator('[data-testid=comp]').click()
    await page
      .locator('[data-testid=comp]', { hasText: 'comp MARK_OK' })
      .waitFor()
  }
}

/** The denied files, as the report names them. */
export const deniedFiles = Object.keys(renderedBy).sort()
