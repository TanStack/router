/**
 * Apps whose server component renders a `'use client'` component that
 * client-only code is restricted to (SPEC J6.1, J6.3), for
 * rsc-use-client-*.test.ts. Where server components render (Vite's `rsc`
 * environment, Rsbuild's RSC layer), the bundler replaces the
 * `'use client'` module by client references: none of its code runs there,
 * so import protection judges it where it runs (SSR, the client), not
 * there.
 *
 * Route `/c` has a loader calling server fn `getC`, which renders
 * `<div>SERVER_ROOT <Comp /></div>` with `renderServerComponent`. `Comp`
 * is a button that shows `MARK_OK` once clicked.
 */
import { waitForHydration } from './rsc-app'
import type { Page } from '@tanstack/compiler-test-utils/test'

/** What the app's import protection reported (`onViolation`). */
export interface Violation {
  env: string
  type: string
  importer: string
  specifier: string
}

/** Start's options with an `onViolation` recorder, and what it recorded. */
export function recorder(behavior: 'mock' | 'error') {
  const violations: Array<Violation> = []
  return {
    violations,
    start: {
      importProtection: {
        behavior,
        onViolation: (info: Violation) => {
          violations.push(info)
        },
      },
    },
  }
}

/** The violations as `env type importer -> specifier` (importer by file name). */
export const summary = (violations: Array<Violation>) =>
  [
    ...new Set(
      violations.map(
        ({ env, type, importer, specifier }) =>
          `${env} ${type} ${importer.split('/').pop()} -> ${specifier}`,
      ),
    ),
  ].sort()

/** The app with `Comp`'s module: its file name, its imports, and what its button reads on click. */
export function appWithComp(comp: {
  name?: string
  imports: string
  onClick?: string
}) {
  const name = comp.name ?? 'Comp'
  return {
    'src/c/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Comp } from './${name}'
export const getC = createServerFn().handler(() =>
  renderServerComponent(<div data-testid="root">SERVER_ROOT <Comp /></div>),
)
`,
    [`src/c/${name}.tsx`]: `'use client'
${comp.imports}
import { useState } from 'react'
export function Comp() {
  const [value, setValue] = useState('')
  return <button data-testid="comp" onClick={() => setValue(${comp.onClick ?? `'MARK_OK'`})}>comp {value}</button>
}
`,
    'src/routes/c.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getC } from '../c/page'
export const Route = createFileRoute('/c')({
  loader: async () => ({ tree: await getC() }),
  component: Page,
})
function Page() {
  return <main data-testid="main">{Route.useLoaderData().tree}</main>
}
`,
  }
}

/** `Comp` imports Start's client-only marker. */
export const markedApp = appWithComp({
  imports: `import '@tanstack/react-start/client-only'`,
})

/**
 * `audit-lib`'s `'use client'` widget renders what its server-only-marked
 * `secret.js` gives; the server fn of `/c` renders the widget in a server
 * component, the only importer of the widget.
 */
export const packageWidgetApp = {
  'node_modules/audit-lib/package.json': JSON.stringify({
    name: 'audit-lib',
    version: '1.0.0',
    type: 'module',
    peerDependencies: { '@tanstack/react-start': '*' },
    exports: { './widget': './widget.jsx' },
  }),
  'node_modules/audit-lib/secret.js': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
  'node_modules/audit-lib/widget.jsx': `'use client'
import { secret } from './secret.js'
export function Widget() {
  return <b data-testid="widget">{secret()}</b>
}
`,
  'src/c/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Widget } from 'audit-lib/widget'
export const getC = createServerFn().handler(() =>
  renderServerComponent(<div data-testid="root">SERVER_ROOT <Widget /></div>),
)
`,
  'src/routes/c.tsx': appWithComp({ imports: '' })['src/routes/c.tsx'],
}

/**
 * `packageWidgetApp`, the route's component also reading the marked
 * module's value through the package's barrel `title.js`: two importers
 * of one mock, the widget held only by the RSC client reference.
 */
export const packageWidgetMixedApp = {
  ...packageWidgetApp,
  'node_modules/audit-lib/package.json': JSON.stringify({
    name: 'audit-lib',
    version: '1.0.0',
    type: 'module',
    peerDependencies: { '@tanstack/react-start': '*' },
    exports: { './widget': './widget.jsx', './title': './title.js' },
  }),
  'node_modules/audit-lib/title.js': `export { secret as title } from './secret.js'\n`,
  'src/routes/c.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { title } from 'audit-lib/title'
import { getC } from '../c/page'
export const Route = createFileRoute('/c')({
  loader: async () => ({ tree: await getC() }),
  component: Page,
})
function Page() {
  return <main data-testid="main">{String(title())}{Route.useLoaderData().tree}</main>
}
`,
}

/** `Comp` is a `.client.tsx` file. */
export const clientFileApp = appWithComp({ name: 'Comp.client', imports: '' })

/**
 * `Comp` imports React's `client-only` package (its exports: `react-server`
 * throws, `default` is empty), as Next.js documents it for client modules.
 */
export const npmClientOnlyApp = {
  'node_modules/client-only/package.json': JSON.stringify({
    name: 'client-only',
    version: '0.0.1',
    exports: {
      '.': { 'react-server': './error.js', default: './index.js' },
    },
  }),
  'node_modules/client-only/index.js': '',
  'node_modules/client-only/error.js': `throw new Error('This module cannot be imported from a Server Component module. It should only be used from a Client Component.')\n`,
  ...appWithComp({ imports: `import 'client-only'` }),
}

/** `Comp` imports a `.client.ts` helper and reads it on click. */
export const clientHelperApp = {
  'src/c/store.client.ts': `export const read = () => 'MARK_OK'\n`,
  ...appWithComp({
    imports: `import { read } from './store.client'`,
    onClick: 'read()',
  }),
}

/** After hydration, `Comp` renders in the server component and its click updates it. */
export async function expectCompClicks(page: Page): Promise<void> {
  await waitForHydration(page)
  await page
    .locator('[data-testid=root]', { hasText: 'SERVER_ROOT comp' })
    .waitFor({ timeout: 5_000 })
  await page.locator('[data-testid=comp]').click()
  await page
    .locator('[data-testid=comp]', { hasText: 'comp MARK_OK' })
    .waitFor()
}
