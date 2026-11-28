import { expect, test } from 'vitest'
import { Route as HealthRoute } from '../src/routes/api/health'
import { Route as PostRoute } from '../src/routes/posts.$postId'

test('the options that only the server uses are not in client code', () => {
  expect(Object.keys(PostRoute.options).sort()).toEqual(['component', 'loader'])
  expect(Object.keys(HealthRoute.options)).toEqual([])
})

test('the module that only server code uses is never loaded', () => {
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBeUndefined()
})
