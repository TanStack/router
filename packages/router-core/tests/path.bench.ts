import { bench, describe, expect } from 'vitest'
import { createLRUCache } from '../src/lru-cache'
import { compileDecodeCharMap, interpolatePath, resolvePath } from '../src/path'

const decoder = compileDecodeCharMap(['@', '+'])
let sink = ''

const resolveCases = [
  { base: '/', to: '/posts/$', result: '/posts/$' },
  { base: '/posts/123', to: '.', result: '/posts/123' },
  { base: '/posts/123/', to: '../456', result: '/posts/456' },
  { base: '/a/b/c', to: '../../d', result: '/a/d' },
  { base: '/a/b/c', to: './d//e/', result: '/a/b/c/d/e' },
] as const

const interpolateCases = [
  {
    path: '/static/settings',
    params: {},
    result: '/static/settings',
    server: false,
  },
  {
    path: '/posts/$postId',
    params: { postId: '123' },
    result: '/posts/123',
    server: false,
  },
  {
    path: '/files/$',
    params: { _splat: 'docs/readme.md' },
    result: '/files/docs/readme.md',
    server: false,
  },
  {
    path: '/files/$',
    params: { _splat: 'docs/a b/file+name.md' },
    result: '/files/docs/a%20b/file%2Bname.md',
    server: false,
  },
  {
    path: '/files/prefix{$}-suffix',
    params: { _splat: 'a@b/c+d' },
    decoder,
    result: '/files/prefixa@b/c+d-suffix',
    server: false,
  },
  {
    path: '/posts/{-$category}/{-$slug}/',
    params: { category: 'router' },
    result: '/posts/router/',
    server: false,
  },
] as const

for (const testCase of resolveCases) {
  expect(resolvePath(testCase)).toBe(testCase.result)
}

for (const testCase of interpolateCases) {
  expect(interpolatePath(testCase).interpolatedPath).toBe(testCase.result)
}

describe('resolvePath', () => {
  bench('mixed uncached paths', () => {
    for (const testCase of resolveCases) {
      sink = resolvePath(testCase)
    }
  })

  bench('mixed cached paths', () => {
    const cache = createLRUCache<string, string>(100)
    for (const testCase of resolveCases) {
      sink = resolvePath({ ...testCase, cache })
      sink = resolvePath({ ...testCase, cache })
    }
  })
})

describe('interpolatePath', () => {
  bench('mixed client parser paths', () => {
    for (const testCase of interpolateCases) {
      sink = interpolatePath(testCase).interpolatedPath
    }
  })

  bench('server fast path params and splats', () => {
    sink = interpolatePath({
      path: '/posts/$postId',
      params: { postId: '123' },
      server: true,
    }).interpolatedPath
    sink = interpolatePath({
      path: '/files/$',
      params: { _splat: 'docs/readme.md' },
      server: true,
    }).interpolatedPath
  })
})
