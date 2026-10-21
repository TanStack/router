/**
 * Implementation test (outside the compiler corpus), moved unchanged from
 * compiler.test.ts (workstream B2; SYNTHESIS N7): a synthetic
 * `compilerTransforms` hook (`renderThingTransform`, written against today's
 * Babel-shaped hook API) configured on the internal compiler. SPEC §1.2
 * excludes compiler extension callbacks from acceptance; the outcome the
 * real extension delivers (RSC CSS) is tested through the real RSC plugin
 * (workstream B5). The env-only concept it shares with the corpus is
 * decided by compiler.test.ts "recompiles aliased env-only calls of a
 * server fn module whose source only mentions createServerFn".
 */
import { describe, expect, test } from 'vitest'
import {
  callProvider,
  createStartCompiler,
  renderThingTransform,
  settleAsync,
} from './legacy/regression-helpers'

/** A Start factory left uncompiled: calling it fails the test. */
const uncompiled = () => {
  throw new Error('uncompiled Start factory')
}

describe('external transforms', () => {
  // The same with an external transform configured (e.g. the RSC CSS one).
  test('a provider with external transforms compiles aliased env-only calls of a server fn module', async () => {
    const files = {
      '/test/src/factory.ts': `export { createServerOnlyFn as makeServerOnly } from '@tanstack/start-fn-stubs'`,
    }
    const id = '/test/src/aliased.ts'
    const source = `import { createServerFn } from '@tanstack/react-start'
import { makeServerOnly } from './factory'
const impl = makeServerOnly(() => 'server-only-value')
export const serverFn = createServerFn().handler(async () => impl())`
    const { compile } = createStartCompiler({
      env: 'server',
      files,
      compilerTransforms: [renderThingTransform],
    })

    expect(
      await settleAsync(async () =>
        callProvider(
          {
            id,
            ssr: (await compile(source, id)) ?? source,
            provider: (await compile(source, `${id}?tss-serverfn-split`))!,
          },
          'serverFn',
          { './factory': { makeServerOnly: uncompiled } },
        ),
      ),
    ).toBe('server-only-value')
  })
})
