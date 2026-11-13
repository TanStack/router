/**
 * A write through a local name of an object (a function's parameter, a
 * `for…of` variable, a `catch` parameter) writes that object: a value read
 * from it when the module loads, before the write, keeps the value the
 * source reads, and the build warns once at the read (review round 1,
 * findings F2-1 and F2-2). Real builds, mounted in a DOM.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

async function mounted(bundler: 'vite' | 'rspack', write: string) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files: routeApp(
      `${head}const S: any = { theme: 'light', inner: { theme: 'light' } }
const initial = [S.theme, S.inner.theme].join()
${write}
export const Route = createFileRoute('/')({
  beforeLoad: () => [S.theme, S.inner.theme].join(),
  component: () => <p>{initial}</p>,
})
`,
      { env: 'client', files: { 'entry.ts': clientMountEntry } },
    ),
  })
  const warnings = findDiagnostics(app.warnings, { severity: 'warning' })
    .filter(({ text }) => text.includes('routes/index.tsx'))
    .map(({ text }) => text)
  try {
    const run = await app.run(
      `const before = entry.Route.options.beforeLoad()
await entry.mount(entry.Route.options.component)
return before`,
    )
    return {
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      beforeLoad: run.result,
      warnings,
    }
  } finally {
    await app.dispose()
  }
}

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  test.each([
    // round 1 F2-1
    ['a parameter', "function set(o: any) { o.theme = 'dark' }\nset(S)"],
    [
      'a destructured parameter',
      "function set({ inner }: any) { inner.theme = 'dark' }\nset(S)",
    ],
    [
      'a default parameter',
      "function set(o: any = S) { o.theme = 'dark' }\nset()",
    ],
    [
      "a local class's method parameter",
      "class Store { apply(o: any) { o.theme = 'dark' } }\nnew Store().apply(S)",
    ],
    [
      'a parameter, called with `.call`',
      "function set(this: unknown, o: any) { o.theme = 'dark' }\nset.call(null, S)",
    ],
    // round 1 F2-2
    ['a `for…of` variable', "for (const s of [S]) { s.theme = 'dark' }"],
    [
      'a destructured `for…of` variable',
      "const all = [S]\nfor (const { inner } of all) { inner.theme = 'dark' }",
    ],
    [
      'a `catch` parameter',
      "try { throw S } catch (e: any) { e.theme = 'dark' }",
    ],
  ])(
    'round 1 F2-1/F2-2: a value read at load before a write through %s keeps the value the source reads',
    async (_, write) => {
      const r = await mounted(bundler, write)
      const written = write.includes('inner') ? 'light,dark' : 'dark,light'
      expect(r.text).toBe('light,light')
      expect(r.beforeLoad).toBe(written)
      expect(r.warnings).toHaveLength(1)
    },
    timeout,
  )
})
