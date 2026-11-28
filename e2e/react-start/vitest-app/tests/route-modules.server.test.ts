import { expect, test } from 'vitest'
import { Route } from '../src/embedded/root'

test('a route module outside the routes directory keeps its server-only options in server code', () => {
  expect(Object.keys(Route.options).sort()).toEqual([
    'component',
    'headers',
    'server',
    'ssr',
  ])
})
