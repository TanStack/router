import { describe, expect, it } from 'vitest'
import {
  collectAffected,
  collectDescendants,
  routeIdFromFile,
} from '../src/hmr-graph'

describe('routeIdFromFile', () => {
  it('maps file routes to route ids', () => {
    expect(routeIdFromFile('/src/routes/index.tsx')).toBe('/')
    expect(routeIdFromFile('/src/routes/deps/index.tsx')).toBe('/deps/')
    expect(routeIdFromFile('/src/routes/deps/$depId.tsx')).toBe('/deps/$depId')
    expect(routeIdFromFile('/src/routes/posts.$postId.tsx')).toBe(
      '/posts/$postId',
    )
  })

  it('ignores the root route and non-route files', () => {
    expect(routeIdFromFile('/src/routes/__root.tsx')).toBeNull()
    expect(routeIdFromFile('/src/screens/Home.tsx')).toBeNull()
  })
})

describe('collectAffected', () => {
  it('walks importers transitively from the changed modules', () => {
    const importers = new Map([
      ['/src/ui/Button', new Set(['/src/screens/Home'])],
      ['/src/screens/Home', new Set(['/src/routes/index'])],
      ['/src/routes/index', new Set(['/src/routeTree.gen'])],
    ])

    expect(collectAffected(importers, ['/src/ui/Button'])).toEqual(
      new Set([
        '/src/ui/Button',
        '/src/screens/Home',
        '/src/routes/index',
        '/src/routeTree.gen',
      ]),
    )
  })
})

describe('collectDescendants', () => {
  it('keeps only modules between the routes and the change', () => {
    const deps = new Map([
      ['/src/routeTree.gen', new Set(['/src/routes/index'])],
      ['/src/routes/index', new Set(['/src/screens/Home', '/src/ui/Card'])],
      ['/src/screens/Home', new Set(['/src/ui/Button'])],
    ])
    const affected = new Set([
      '/src/routeTree.gen',
      '/src/routes/index',
      '/src/screens/Home',
      '/src/ui/Button',
    ])

    expect(collectDescendants(deps, ['/src/routes/index'], affected)).toEqual(
      new Set(['/src/routes/index', '/src/screens/Home', '/src/ui/Button']),
    )
  })
})
