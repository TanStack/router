/**
 * A call whose result is a route option's value holds the functions it is
 * handed (R152): the router calls the value later, so a wrapper of the
 * component (`observer(Page)`, `withAuth(observer(Page))`, `memo(Page)`
 * through a `const`) does not run it when the module loads, and the option
 * is split even when the page reads state the loader writes. Any other call
 * reads as before: a wrapped sub-component used only as a JSX tag stays in
 * the route module, and the warning says it *may* use the state. Real
 * builds, mounted in a DOM.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

async function buildRoute(bundler: 'vite' | 'rspack', route: string) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files: routeApp(route, {
      env: 'client',
      files: {
        'entry.ts': clientMountEntry,
        // wrappers the compiler knows nothing of (an app's own HOCs)
        'hoc.ts':
          'export function observer<T>(c: T): T { return c }\nexport function withAuth<T>(c: T): T { return c }\n',
      },
    }),
  })
  const warnings = findDiagnostics(app.warnings, {
    severity: 'warning',
  })
    .filter(({ text }) => text.includes('routes/index.tsx'))
    .map(({ text }) => text)
  try {
    const run = await app.run(
      'await entry.mount(entry.Route.options.component)',
    )
    return {
      where: app.where('MARK_PAGE'),
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      warnings,
    }
  } finally {
    await app.dispose()
  }
}

const route = (decls: string, options: string) =>
  `${head}import { memo } from 'react'
import { observer, withAuth } from '../hoc'
const seen = new Set<number>()
${decls}
export const Route = createFileRoute('/')({
  loader: () => {
    seen.add(1)
  },
${options}
})
`

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  test.each([
    [
      'an unknown wrapper',
      '',
      '  component: observer(function Page() { return <p>MARK_PAGE{seen.size}</p> }),',
    ],
    [
      'wrappers of wrappers',
      '',
      '  component: withAuth(observer(function Page() { return <p>MARK_PAGE{seen.size}</p> })),',
    ],
    [
      '`memo` through a `const`',
      'function Page() { return <p>MARK_PAGE{seen.size}</p> }\nconst P = memo(Page)',
      '  component: P,',
    ],
  ])(
    'splits a component in %s reading state the loader writes',
    async (_, decls, options) => {
      const r = await buildRoute(bundler, route(decls, options))
      expect(r.where).toBe('lazy')
      expect(r.text).toBe('MARK_PAGE0')
      expect(r.warnings).toEqual([])
    },
    timeout,
  )

  test(
    'keeps a wrapped sub-component used as a JSX tag in place, saying it may use the state',
    async () => {
      const r = await buildRoute(
        bundler,
        route(
          'const Card = observer(function Card() { return <p>MARK_PAGE{seen.size}</p> })',
          '  component: function Page() { return <Card /> },',
        ),
      )
      expect(r.where).toBe('eager')
      expect(r.text).toBe('MARK_PAGE0')
      expect(r.warnings).toHaveLength(1)
      expect(r.warnings[0]).toContain(
        'stays in the route module because it may use `seen` when the module loads (the function is handed to `observer`), and the module writes `seen`; move both to their own module',
      )
    },
    timeout,
  )
})
