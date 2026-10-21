/**
 * Harness control of known-bugs-hydrate.test.ts (outside the compiler
 * corpus: it checks the rejection matchers of that file, not a compiler).
 * It runs the internal Hydrate compile (`./legacy/regression-helpers`) to
 * obtain a real rejection; the corpus pins it guards decide the outcome
 * through the public Start plugin (`../render.ts`).
 */
import { describe, expect, test } from 'vitest'
import { diagnosticsOf } from '@tanstack/compiler-test-utils/diagnostics'
import {
  compileHydrate,
  expectCompileError,
  withoutQuotedSource,
} from './legacy/regression-helpers'

const head = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
`

/**
 * Clear compile errors that a fix may reject split children with: the
 * names the error gives in its own words, without the code frame quoting
 * the source (`expectCompileError`); either of `await` and `async` for
 * `await` in the children.
 */
const rejections = {
  arguments: [['Hydrate', 'arguments']],
  await: [
    ['Hydrate', 'await'],
    ['Hydrate', 'async'],
  ],
  Route: [['Hydrate', 'Route']],
}

/**
 * Asserts that `error` is a compile error about `source` that names every
 * name of one of `alternatives` (`expectCompileError`; position free, as
 * the fix may report the boundary or the read).
 */
function expectRejection(
  error: unknown,
  source: string,
  alternatives: Array<Array<string>>,
) {
  const failures: Array<unknown> = []
  for (const names of alternatives) {
    try {
      expectCompileError(error, { source, at: undefined, names })
      return
    } catch (failure) {
      failures.push(failure)
    }
  }
  throw failures[0]
}

describe('harness controls', () => {
  test('client: the rejection matchers ignore the code frame of an unrelated error', async () => {
    const code = `${head}import { createFileRoute } from '@tanstack/react-router'
import { loadData } from './data'
export const Route = createFileRoute('/')({ component: Page })
export async function Page() {
  return <Hydrate when={load()}>{async () => <p>{arguments[0]}{Route.id}{await loadData()}</p>}</Hydrate>
}`
    const error = await compileHydrate('client', code).catch(
      (caught: unknown) => caught,
    )
    expect(withoutQuotedSource(diagnosticsOf(error)[0]!.text, code)).toMatch(
      /function/,
    )
    for (const rejection of Object.values(rejections)) {
      expect(() => expectRejection(error, code, rejection)).toThrow()
    }
  })
})
