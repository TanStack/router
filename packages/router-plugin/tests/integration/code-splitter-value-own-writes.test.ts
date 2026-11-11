/**
 * A component option whose call runs a function writing module state
 * (`memo(function Page() { didInit = true })`): the write may run at any
 * time, but when nothing else of the module touches that state, it and the
 * state load with the component's chunk, so the option is split, with no
 * warning (REVIEW design 2 step 4, finding 3; the same write at load is
 * split already). Another reader keeps the option in place. Real builds,
 * mounted in a DOM.
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
        'registry.ts': 'export const registry = { count: 0 }\n',
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
import { registry } from '../registry'
${decls}
export const Route = createFileRoute('/')({
${options}
})
`

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  test.each([
    [
      'assigns a `let`',
      'let didInit = false',
      '  component: memo(function Page() { if (!didInit) { didInit = true } return <p>MARK_PAGE{String(didInit)}</p> }),',
      'MARK_PAGEtrue',
    ],
    [
      'writes a member of a `const`',
      'const seen = { n: 0 }',
      '  component: memo(function Page() { seen.n++; return <p>MARK_PAGE{seen.n}</p> }),',
      'MARK_PAGE1',
    ],
    [
      'writes a member of an import in an event handler',
      '',
      '  component: memo(function Page() { return <button onClick={() => { registry.count++ }}>MARK_PAGE</button> }),',
      'MARK_PAGE',
    ],
    [
      'is named, writing a member of a `const`',
      'const seen = { n: 0 }\nfunction Page() { seen.n++; return <p>MARK_PAGE{seen.n}</p> }',
      '  component: memo(Page),',
      'MARK_PAGE1',
    ],
  ])(
    'splits a component whose call runs a function that %s nothing else touches',
    async (_, decls, options, text) => {
      const r = await buildRoute(bundler, route(decls, options))
      expect(r.where).toBe('lazy')
      expect(r.text).toBe(text)
      expect(r.warnings).toEqual([])
    },
    timeout,
  )

  test(
    'keeps it in place when other code reads the state (control)',
    async () => {
      const r = await buildRoute(
        bundler,
        route(
          'let didInit = false',
          '  beforeLoad: () => didInit,\n  component: memo(function Page() { if (!didInit) { didInit = true } return <p>MARK_PAGE{String(didInit)}</p> }),',
        ),
      )
      expect(r.where).toBe('eager')
      expect(r.text).toBe('MARK_PAGEtrue')
      expect(r.warnings).toHaveLength(1)
      expect(r.warnings[0]).toContain(
        "The `component` option of routes/index.tsx is not code-split: it writes `didInit`, which other code also uses, so a split would change when that code sees the write. Use `didInit` only inside the option's functions.",
      )
    },
    timeout,
  )
})
