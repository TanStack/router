import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { expect, test } from 'vitest'
import { routeTree } from '../src/routeTree.gen'

test('the route tree of the server has every route', () => {
  const router = createRouter({ routeTree, history: createMemoryHistory() })

  expect(Object.keys(router.routesById).sort()).toEqual([
    '/',
    '/api/health',
    '/posts/$postId',
    '__root__',
  ])
})
