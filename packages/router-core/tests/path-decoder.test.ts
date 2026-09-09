import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import * as pathUtils from '../src/path'
import { createTestRouter } from './routerTestUtils'

afterEach(() => vi.restoreAllMocks())

test.each([
  { allowed: ['.', '@'], input: 'x%40.y', expected: 'x@.y' },
  { allowed: ['*', '@'], input: 'pre%40*post', expected: 'pre@*post' },
  { allowed: ['(', ')', '@'], input: '(%40)', expected: '(@)' },
  { allowed: ['|', '@'], input: '%7C%40%2F', expected: '|@%2F' },
  { allowed: ['12@', '1'], input: '12%40', expected: '12@' },
  { allowed: ['%', '/'], input: '%252F/%2F', expected: '%2F//' },
  { allowed: ['@', '@', '+'], input: '%40%2B', expected: '@+' },
  { allowed: [], input: '%40', expected: '%40' },
])(
  'compiles literal decoder alternatives: $allowed',
  ({ allowed, input, expected }) => {
    expect(pathUtils.compileDecodeCharMap(allowed)(input)).toBe(expected)
  },
)

function setup(allowed?: Array<'@' | '+'>) {
  const root = new BaseRootRoute({})
  const item = new BaseRoute({ getParentRoute: () => root, path: '/items/$id' })
  const router = createTestRouter({
    routeTree: root.addChildren([item]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    pathParamsAllowedCharacters: allowed,
    scrollRestoration: false,
  })
  router.history.destroy()
  const build = () =>
    router.buildLocation({ to: '/items/$id', params: { id: '@+' } }).href
  return { router, item, build }
}

test('keeps the decoder and cached paths across provider option updates', () => {
  const allowed: Array<'@' | '+'> = ['@']
  const { router, item, build } = setup(allowed)
  const decoder = router.pathParamsDecoder
  expect(build()).toBe('/items/@%2B')
  const plan = item._pathCache
  const compile = vi.spyOn(pathUtils, 'compileDecodeCharMap')
  const interpolate = vi.spyOn(pathUtils, 'interpolatePath')
  for (const characters of [allowed, [...allowed], allowed]) {
    router.update({
      ...router.options,
      context: {},
      pathParamsAllowedCharacters: characters,
    })
    expect(build()).toBe('/items/@%2B')
    expect(router.pathParamsDecoder).toBe(decoder)
    expect(item._pathCache).toBe(plan)
  }
  expect(compile).not.toHaveBeenCalled()
  expect(interpolate).not.toHaveBeenCalled()
})

test('recompiles when the allowed characters change, including in-place edits', () => {
  const allowed: Array<'@' | '+'> = ['@']
  const { router, build } = setup(allowed)
  const decoder = router.pathParamsDecoder
  expect(build()).toBe('/items/@%2B')
  allowed[0] = '+'
  router.update({ ...router.options })
  expect(build()).toBe('/items/%40+')
  expect(router.pathParamsDecoder).not.toBe(decoder)
  router.update({ pathParamsAllowedCharacters: ['@', '+'] })
  expect(build()).toBe('/items/@+')
})

test('restores normal encoding when allowed characters are removed', () => {
  const { router, build } = setup(['@'])
  expect(build()).toBe('/items/@%2B')
  router.update({ pathParamsAllowedCharacters: undefined })
  expect(router.pathParamsDecoder).toBeUndefined()
  expect(build()).toBe('/items/%40%2B')
})

test('keeps a directly assigned decoder on unrelated option updates', () => {
  const { router, build } = setup()
  const decoder = pathUtils.compileDecodeCharMap(['+'])
  router.pathParamsDecoder = decoder
  expect(build()).toBe('/items/%40+')
  router.update({ context: {} })
  expect(router.pathParamsDecoder).toBe(decoder)
  expect(build()).toBe('/items/%40+')
})

test('does not remember a configuration whose decoder failed to compile', () => {
  const { router, build } = setup(['@'])
  vi.spyOn(pathUtils, 'compileDecodeCharMap').mockImplementationOnce(() => {
    throw new Error('decoder compilation failed')
  })
  expect(() => router.update({ pathParamsAllowedCharacters: ['+'] })).toThrow(
    'decoder compilation failed',
  )
  router.update({ context: {} })
  expect(build()).toBe('/items/%40+')
})
