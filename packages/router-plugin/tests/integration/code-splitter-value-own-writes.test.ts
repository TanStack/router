/**
 * A component option whose call runs a function writing module state
 * (`memo(function Page() { didInit = true })`): the write may run at any
 * time, but when nothing else of the module touches that state, it and the
 * state load with the component's chunk, so the option is split, with no
 * warning (REVIEW design 2 step 4, finding 3; the same write at load is
 * split already). Another reader keeps the option in place, wherever it
 * evaluates: one in a module two chunks share too, which would otherwise
 * import the state from the component's chunk while that chunk imports it
 * (REVIEW design 2 final, finding 2). The fixes the warning offers, applied:
 * the state in an object, or in a module of its own that exports the
 * function writing it (two options writing it too). Real builds, mounted in
 * a DOM.
 */
import { describe, expect, test } from 'vitest'
import { expectNoDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

async function buildRoute(
  bundler: 'vite' | 'rspack',
  route: string,
  /** Split groupings (`codeSplittingOptions.defaultBehavior`). */
  groupings?: Array<Array<'loader' | 'component'>>,
  files: Record<string, string> = {},
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
        ...files,
      },
    }),
  })
  // (every channel: webpack prints some warnings through the console)
  const reported = [...app.warnings, ...app.consoleMessages]
  try {
    const run = await app.run(
      'await entry.mount(entry.Route.options.component)',
    )
    return {
      where: app.where('MARK_PAGE'),
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      reported,
      root: app.root,
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
      expectNoDiagnostic(r.reported, {
        severity: 'warning',
        file: 'routes/index.tsx',
        root: r.root,
      })
    },
    timeout,
  )

  test(
    'keeps a value assigning a `let` that a module two chunks share reads in place',
    async () => {
      const r = await buildRoute(
        bundler,
        `${head}let n = 1
export const Route = createFileRoute('/')({
  loader: () => flags,
  component: (n = 5, () => <p>MARK_PAGE{String(flags)}</p>),
})
const flags = [n]
`,
        [['loader'], ['component']],
      )
      expect(r.where).toBe('eager')
      expect(r.text).toBe('MARK_PAGE5')
    },
    timeout,
  )
})
