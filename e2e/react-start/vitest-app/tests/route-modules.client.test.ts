import { expect, test } from 'vitest'
import { Route } from '../src/embedded/root'

test('a route module outside the routes directory has no server-only options in client code', () => {
  expect(Object.keys(Route.options)).toEqual(['component'])
})

test('the module that only server code uses is never loaded', () => {
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBeUndefined()
})
