import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import {
  buildTaskPath,
  initialTaskTarget,
  type RootBenchmarkContext,
} from '../../shared'
import { routeTree } from './routeTree.gen'

export function getRouter(rootContext: RootBenchmarkContext) {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [buildTaskPath(initialTaskTarget)],
    }),
    routeTree,
    context: rootContext,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
