/**
 * A component option whose call runs a function writing module state
 * (`memo(function Page() { didInit = true })`): the write may run at any
 * time, but when nothing else of the module touches that state, it and the
 * state load with the component's chunk, so the option is split, with no
 * warning (REVIEW design 2 step 4, finding 3; the same write at load is
 * split already). Another reader keeps the option in place, wherever it
 * evaluates: one in a module two chunks share too, which would otherwise
 * import the state from the component's chunk while that chunk imports it
 * (REVIEW design 2 final, finding 2). Real builds, mounted in a DOM.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

async function buildRoute(
  bundler: 'vite' | 'rspack',
  route: string,
  /** Split groupings (`codeSplittingOptions.defaultBehavior`). */
  groupings?: Array<Array<'loader' | 'component'>>,
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    ...(groupings && {
      pluginOptions: { codeSplittingOptions: { defaultBehavior: groupings } },
    }),
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
      'is declared in a `const`, writing a member of a `const`',
      'const seen = { n: 0 }\nconst C = memo(function Page() { seen.n++; return <p>MARK_PAGE{seen.n}</p> })',
      '  component: C,',
      'MARK_PAGE1',
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
})
