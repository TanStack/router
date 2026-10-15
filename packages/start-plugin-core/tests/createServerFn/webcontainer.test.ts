import { afterAll, beforeAll, expect, test } from 'vitest'
import { callProvider, compileAll } from '../regression-helpers'

// WebContainers (StackBlitz, bolt.new) run the compilers on Yuku's
// WebAssembly core, and their `TextEncoder.encodeInto('')` reports the
// previous call's byte counts: https://github.com/stackblitz/webcontainer-core/issues/2173
const encodeInto = TextEncoder.prototype.encodeInto

beforeAll(() => {
  process.versions.webcontainer = '1.0.0'
  let previous = { read: 0, written: 0 }
  TextEncoder.prototype.encodeInto = function (source, destination) {
    if (source === '') {
      return previous
    }
    previous = encodeInto.call(this, source, destination)
    return previous
  }
})

afterAll(() => {
  delete process.versions.webcontainer
  TextEncoder.prototype.encodeInto = encodeInto
})

test('compiles and runs a server function in a WebContainer', async () => {
  const { provider } =
    await compileAll(`import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hello')`)
  expect(await callProvider(provider, 'greet')).toBe('hello')
})
