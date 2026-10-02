import { createRouter } from '@tanstack/react-router'
import { test } from 'vitest'
import { routeTree } from './routeTree.gen'

test('scaffolded plain-TS routes typecheck against the generated tree', () => {
  createRouter({ routeTree })
})
