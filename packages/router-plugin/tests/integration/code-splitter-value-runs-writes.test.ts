/**
 * A split option whose value calls a function of the module that writes a
 * member of state the route module keeps (`component: withLog(Page)`,
 * `withLog` pushing to `hits`): the write runs when the value evaluates,
 * when the module loads, as a write written inline in the value does. The
 * option stays in the route module, with one warning, so what kept code
 * reads before any chunk loads is what the source gives (review round 1,
 * finding F2-3; the `let` twin, `count++` in the wrapper, was kept
 * already). A wrapper writing state only the chunk uses still splits.
 * Real builds, mounted in a DOM.
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
      files: { 'entry.ts': clientMountEntry },
    }),
  })
  const warnings = findDiagnostics(app.warnings, { severity: 'warning' })
    .filter(({ text }) => text.includes('routes/index.tsx'))
    .map(({ text }) => text)
  try {
    const run = await app.run(`const before = entry.Route.options.beforeLoad()
await entry.mount(entry.Route.options.component)
return before`)
    return {
      where: app.where('MARK_PAGE'),
      beforeLoad: run.result,
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      warnings,
    }
  } finally {
    await app.dispose()
  }
}

const route = (decls: string, component: string, beforeLoad: string) =>
  `${head}${decls}
export const Route = createFileRoute('/')({
  beforeLoad: () => ${beforeLoad},
  component: ${component},
})
`

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  test.each([
    [
      'pushes to an array',
      "const hits: Array<string> = []\nconst withLog = <T,>(c: T): T => (hits.push('w'), c)",
      'withLog(() => <p>MARK_PAGE</p>)',
      'hits.length',
    ],
    [
      'writes a member of an object',
      'const S = { v: 0 }\nfunction wrap<T>(c: T): T { S.v = 1; return c }',
      'wrap(() => <p>MARK_PAGE</p>)',
      'S.v',
    ],
    [
      'pushes to an array, named in a `const`',
      "const hits: Array<string> = []\nconst withLog = <T,>(c: T): T => (hits.push('w'), c)\nconst Page = withLog(() => <p>MARK_PAGE</p>)",
      'Page',
      'hits.length',
    ],
    [
      'pushes to the array it is handed',
      "const hits: Array<string> = []\nfunction wrap<T>(c: T, into: Array<string>): T { into.push('w'); return c }",
      'wrap(() => <p>MARK_PAGE</p>, hits)',
      'hits.length',
    ],
  ])(
    'round 1 F2-3: a component whose wrapper %s the route module keeps stays, and kept code reads what the source gives',
    async (_, decls, component, beforeLoad) => {
      const r = await buildRoute(bundler, route(decls, component, beforeLoad))
      expect(r.beforeLoad).toBe(1)
      expect(r.text).toBe('MARK_PAGE')
      expect(r.where).toBe('eager')
      expect(r.warnings).toHaveLength(1)
    },
    timeout,
  )

  test(
    'round 1 F2-3 (control): a component whose wrapper writes state only the component uses splits, with no warning',
    async () => {
      const r = await buildRoute(
        bundler,
        route(
          'const reg: Array<unknown> = []\nfunction wrap<T>(c: T): T { reg.push(c); return c }',
          'wrap(() => <p>MARK_PAGE{reg.length}</p>)',
          '0',
        ),
      )
      expect(r.where).toBe('lazy')
      expect(r.text).toBe('MARK_PAGE1')
      expect(r.warnings).toEqual([])
    },
    timeout,
  )
})
