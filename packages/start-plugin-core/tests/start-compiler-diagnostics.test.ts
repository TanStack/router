/**
 * Malformed server fn input is rejected clearly (SPEC G5, §8 malformed-input
 * control), through the public Start plugin: the dev server's client
 * environment refuses to serve the module with a compile error that points
 * at the offending line. Prose, frame layout and
 * context length are free (§5.7).
 */
import { test } from 'vitest'
import {
  compileError,
  expectCompileError,
  useStartHost,
} from './regression-helpers'

const host = useStartHost()

// Spreading the handler's arguments is a type error (TS2556 against the real
// declarations: a spread argument must be a tuple or go to a rest
// parameter), so this is a malformed-input control: the compiler cannot tell
// which function is the handler, and has to say so.
test('a server fn whose handler arguments are spread is rejected at the call', async () => {
  const source = `import { createServerFn } from '@tanstack/react-start'
const args: Array<() => unknown> = []
export const fn = createServerFn().handler(...args)`
  const startCase = await (await host()).case({ 'module.tsx': source })
  expectCompileError(await compileError(startCase), {
    source,
    at: '...args',
  })
})
