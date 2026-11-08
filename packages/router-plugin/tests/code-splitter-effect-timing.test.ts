/**
 * When an effect that sets state only the split component reads runs, on
 * the Vite dev server (`route-app.ts`): the same whether the module writes
 * the state in its declaration (`let calls = seed()`) or in a statement
 * after it (`calls = seed()`, `calls += seed()`). Moving an initialiser to
 * a lazy chunk is allowed (G3; DECISIONS R29/R31), so either may run at load
 * or at the first render, but both run at the same time, once, with the
 * value the code gives. A write of a pure value is the control. Builds are
 * in integration/code-splitter-effect-timing.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { head, loadRoute } from './route-app'

const shapes = {
  initialiser: `let calls = globalThis.seed()`,
  assignment: `let calls = 0\ncalls = globalThis.seed()`,
  'compound assignment': `let calls = 0\ncalls += globalThis.seed()`,
  'pure value (control)': `let calls = 0\ncalls = 5`,
}

/** The effect's runs at load and after the first render, the render, and the reports. */
async function observe(code: string) {
  const route = await loadRoute(`${head}${code}
export const Route = createFileRoute('/')({ component: () => <p>{String(calls)}</p> })
`)
  const run = await route.run<{
    atLoad: number
    after: number
    html: string
  }>(
    `const atLoad = globalThis.seeds
const html = await render('component')
return { atLoad, after: globalThis.seeds, html }`,
    {
      before: `globalThis.seeds = 0; globalThis.seed = () => ++globalThis.seeds`,
    },
  )
  // warnings and errors since the route was written
  const reports = findDiagnostics(await route.diagnostics(), {}).length
  return { ...run, reports }
}

describe('on the Vite dev server, an effect setting state only the split component reads', () => {
  it('runs at the same time, written in its declaration or after it', async () => {
    const initialiser = await observe(shapes.initialiser)
    expect(initialiser).toMatchObject({ after: 1, html: '<p>1</p>' })
    for (const name of ['assignment', 'compound assignment'] as const) {
      expect(await observe(shapes[name]), name).toEqual(initialiser)
    }
  })

  it('runs nothing for a pure value (control)', async () => {
    expect(await observe(shapes['pure value (control)'])).toMatchObject({
      atLoad: 0,
      after: 0,
      html: '<p>5</p>',
    })
  })
})
