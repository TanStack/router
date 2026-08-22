import { bench, describe } from 'vitest'
import { decodePath } from '../src/string-encoding'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import { interpolatePath } from '../src/path'

/**
 * Benchmarks for the hot string encoding/decoding paths.
 *
 * These run on every navigation, so regressions here are user-visible.
 * Used to validate that hardening changes (e.g. safeDecodeURIComponent)
 * do not degrade performance. Run with: pnpm vitest bench tests/string-encoding.bench.ts
 */

const tree = processRouteTree({
  id: '__root__',
  isRoot: true,
  fullPath: '/',
  path: '/',
  children: [
    { id: '/$', fullPath: '/$', path: '$' },
    { id: '/posts', fullPath: '/posts', path: 'posts' },
    { id: '/posts/$id', fullPath: '/posts/$id', path: 'posts/$id' },
    { id: '/files/$', fullPath: '/files/$', path: 'files/$' },
    {
      id: '/users/$userId/settings',
      fullPath: '/users/$userId/settings',
      path: 'users/$userId/settings',
    },
  ],
}).processedTree

const plainPath = '/posts/123/settings'
const unicodePath = '/café/日本語/🎉'
const encodedPath = '/a%20b%2Fc%3Fd%23e'
const params = {
  id: 'hello world/with specials?&#',
  _splat: 'docs/v1/getting started.md',
}

describe('decodePath', () => {
  bench('plain ascii path (fast path)', () => {
    decodePath(plainPath)
  })

  bench('unicode path', () => {
    decodePath(unicodePath)
  })

  bench('heavily encoded path', () => {
    decodePath(encodedPath)
  })
})

describe('interpolatePath', () => {
  bench('single param', () => {
    interpolatePath({ path: '/posts/$id', params })
  })

  bench('multiple params + splat', () => {
    interpolatePath({ path: '/users/$userId/files/$', params })
  })
})

describe('findRouteMatch', () => {
  bench('static match', () => {
    findRouteMatch('/posts', tree)
  })

  bench('param match', () => {
    findRouteMatch('/posts/123', tree)
  })

  bench('deep param match', () => {
    findRouteMatch('/users/42/settings', tree)
  })

  bench('splat match', () => {
    findRouteMatch('/files/docs/v1/readme.md', tree)
  })

  bench('encoded param match', () => {
    findRouteMatch('/posts/hello%20world', tree)
  })
})
