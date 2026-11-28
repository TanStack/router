/**
 * Malformed server fn input is rejected clearly (SPEC G5, §8 malformed-input
 * control), through the public Start plugin: the dev server's client
 * environment refuses to serve the module with a compile error that points
 * at the offending line. Prose, frame layout and
 * context length are free (SPEC §5.7).
 */
import { beforeAll, test } from 'vitest'
import {
  compileError,
  createStartHost,
  expectCompileError,
} from './regression-helpers'
import type { StartHost } from './start-host'

let host: StartHost
beforeAll(async () => {
  host = await createStartHost()
  return () => host.close()
})

// Spreading the handler's arguments is a type error (TS2556 against the real
// declarations: a spread argument must be a tuple or go to a rest
// parameter), so this is a malformed-input control: the compiler cannot tell
// which function is the handler, and has to say so.
test('a server fn whose handler arguments are spread is rejected at the call', async () => {
  const source = `import { createServerFn } from '@tanstack/react-start'
const args: Array<() => unknown> = []
export const fn = createServerFn().handler(...args)`
  const startCase = await host.case({ 'module.tsx': source })
  expectCompileError(await compileError(startCase), {
    source,
    at: '...args',
  })
})
