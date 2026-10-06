/**
 * Known Start compiler bugs found with scenarios ported from
 * babel-dead-code-elimination's tests
 * (pcattori/babel-dead-code-elimination `src/dead-code-elimination.test.ts`,
 * MIT), pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { describe, expect, test } from 'vitest'
import { compileStartModule } from './compile-start-module'
import { getModuleErrors } from './validate-module'

describe('known Start compiler bugs ported from babel-dead-code-elimination', () => {
  // Source: dead-code-elimination.test.ts "only eliminates newly unreferenced
  // identifiers" (applied to locals of a surviving function).
  // Bug: when the compiler drops the other environment's implementation of a
  // `createIsomorphicFn`/`createServerOnlyFn`/`createClientOnlyFn` declared
  // inside a hook, it also deletes the hook's locals that only that
  // implementation read, including their initializers. Here the first
  // `useId()` disappears from one environment only, so the next `useId()`
  // returns a different id on the server and on the client. Impact: hydration
  // mismatches (and any other side effect of such an initializer runs in one
  // environment only). Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'client',
      env: 'client' as const,
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const serverId = useId()
  const describe = createIsomorphicFn().server(() => serverId).client(() => 'client')
  const inputId = useId()
  return [describe(), inputId]
}
`,
    },
    {
      name: 'server',
      env: 'server' as const,
      code: `import { createClientOnlyFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const clientId = useId()
  const describe = createClientOnlyFn(() => clientId)
  const inputId = useId()
  return [describe, inputId]
}
`,
    },
  ])(
    '$name: hook calls read only by the removed implementation still run',
    async ({ env, code }) => {
      const output = await compileStartModule({ env, code })
      expect(output).not.toBeNull()
      expect(await getModuleErrors(output!)).toEqual([])
      expect(output!.match(/\buseId\(\)/g)).toHaveLength(2)
    },
  )
})
