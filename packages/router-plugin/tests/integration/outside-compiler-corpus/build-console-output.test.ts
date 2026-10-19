/**
 * Internal control, outside the compiler corpus (SPEC §8: no clause
 * coverage, must not block a correct rewrite): the router plugin's debug
 * output (the compiled code of every route) is opt-in (`TSR_VITE_DEBUG`),
 * so a build with default options prints nothing to the console. Required
 * or configured build-time output (not-split warnings, generator logs) is
 * allowed by SPEC G7 and tested where it belongs.
 * Source: r5-gaps N9 (debug output on by default).
 */
import { afterEach, expect, test, vi } from 'vitest'
import { build, routeApp, routeHead } from '../../build-harness'

/** Records what is printed to the console (log, info, debug). */
function recordConsole() {
  const printed: Array<string> = []
  for (const method of ['log', 'info', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      printed.push(args.map(String).join(' '))
    })
  }
  return printed
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('with default options, a build prints nothing to the console (split, unsplit and shared-binding routes)', async () => {
  expect(process.env.TSR_VITE_DEBUG).toBeUndefined()
  const printed = recordConsole()
  const app = await build({
    bundler: 'vite',
    env: 'client',
    files: routeApp(
      `${routeHead()}function Page() {
  return <p>MARK_PAGE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`,
      {
        env: 'client',
        files: {
          // Nothing to split
          'routes/plain.tsx': `${routeHead()}export const Route = createFileRoute('/plain')({
  staticData: { label: 'MARK_PLAIN' },
})
`,
          // A binding the loader and the split component share
          'routes/shared.tsx': `${routeHead()}const shared = { label: 'MARK_SHARED' }
function Shared() {
  return <p>{shared.label}</p>
}
export const Route = createFileRoute('/shared')({
  loader: () => shared.label,
  component: Shared,
})
`,
          'entry.ts': `export * from './routes/index'
export { Route as PlainRoute } from './routes/plain'
export { Route as SharedRoute } from './routes/shared'
`,
        },
      },
    ),
  })
  expect(app.where('MARK_SHARED')).not.toBe('nowhere')
  expect(printed).toEqual([])
}, 120_000)
