import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
  useParams,
} from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { renderToString } from 'react-dom/server'
import { deepPath, depth } from '../cases'
import type { AnyRoute } from '@tanstack/react-router'
import type { OutletCase } from '../cases'

export const serverEnvironment: boolean | undefined = isServer

function ExplicitOutlet() {
  return <Outlet />
}

function Leaf() {
  const match = useMatch({ strict: false })
  const params = useParams({ strict: false })
  return <span data-route={match.routeId}>{params.id}</span>
}

function UnexpectedFallback() {
  return <span>Unexpected fallback</span>
}

export async function createPreparedScenario(
  workload: OutletCase,
  state: 'first' | 'second' | 'empty',
) {
  const root = createRootRoute()
  const chain: Array<AnyRoute> = []
  let parent: AnyRoute = root
  for (let index = 0; index < depth; index++) {
    const parentRoute = parent
    const route = createRoute({
      getParentRoute: () => parentRoute,
      path: `level-${index}`,
      component:
        workload.mode === 'explicit' ||
        (workload.mode === 'mixed' && index % 2 === 0)
          ? ExplicitOutlet
          : undefined,
    })
    chain.push(route)
    parent = route
  }
  const leaf = createRoute({
    getParentRoute: () => parent,
    path: '$id',
    component: Leaf,
  })
  const empty = createRoute({ getParentRoute: () => parent, path: 'empty' })
  parent.addChildren([leaf, empty])
  for (let index = chain.length - 2; index >= 0; index--) {
    chain[index]!.addChildren([chain[index + 1]!])
  }
  const history = createMemoryHistory({
    initialEntries: [`${deepPath}/${state}`],
  })
  const router = createRouter({
    routeTree: root.addChildren([chain[0]!]),
    history,
    isServer: true,
    defaultPendingComponent: UnexpectedFallback,
    defaultErrorComponent: UnexpectedFallback,
  })
  try {
    await router.load()
    const render = () => renderToString(<RouterProvider router={router} />)
    function check(html: string) {
      const expected = [root, ...chain, state === 'empty' ? empty : leaf]
      const matches = router.state.matches
      if (
        matches.length !== expected.length ||
        matches.some(
          (match, index) =>
            match.routeId !== expected[index]!.id || match.status !== 'success',
        )
      ) {
        throw new Error('Repeated SSR must retain every loaded logical match')
      }
      if (
        html.includes('Unexpected fallback') ||
        (state === 'empty'
          ? html.includes('<span')
          : !html.includes(`<span data-route="${leaf.id}">${state}</span>`))
      ) {
        throw new Error('SSR must render the leaf in its nearest match context')
      }
    }
    return { render, check, dispose: () => history.destroy() }
  } catch (error) {
    history.destroy()
    throw error
  }
}
