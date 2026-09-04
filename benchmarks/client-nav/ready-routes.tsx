import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
  useLoaderData,
  useParams,
} from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

export async function createBenchmark(mode: 'eager' | 'lazy', depth: number) {
  let loaderCalls = 0
  let imports = 0
  let navigations = 0
  let rendered = 0
  let pathA = ''
  let pathB = ''
  const rootRoute = createRootRoute({ component: Outlet })
  let parent: AnyRoute = rootRoute
  const leafParam = `param${depth - 2}`
  const Leaf = () => {
    const params = useParams({ strict: false }) as Record<string, string>
    const data = useLoaderData({ strict: false }) as { value: string }
    return (
      <span data-testid="ready-state">{`${params[leafParam]}:${data.value}`}</span>
    )
  }
  const leafComponent =
    mode === 'lazy'
      ? lazyRouteComponent(async () => {
          imports++
          return { default: Leaf }
        })
      : Leaf
  for (let index = 0; index < depth - 1; index++) {
    const ancestor = parent
    const param = `param${index}`
    const route = createRoute({
      getParentRoute: () => ancestor,
      path: `level${index}/$${param}`,
      component: index === depth - 2 ? leafComponent : Outlet,
      loader: ({ params }) => {
        loaderCalls++
        return { value: params[param] }
      },
      staleTime: Infinity,
      gcTime: Infinity,
    })
    ancestor.addChildren([route])
    parent = route
    pathA += `/level${index}/a`
    pathB += `/level${index}/b`
  }
  const history = createMemoryHistory({ initialEntries: [pathA] })
  const router = createRouter({ routeTree: rootRoute as AnyRoute, history })
  const unsubscribe = router.subscribe('onRendered', () => rendered++)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const initialRender = new Promise<void>((resolve) => {
    const stop = router.subscribe('onRendered', () => {
      stop()
      resolve()
    })
  })
  root.render(<RouterProvider router={router} />)
  await initialRender

  const run = async (count: number) => {
    for (let index = 0; index < count; index++) {
      const target = navigations++ % 2 ? pathA : pathB
      await router.navigate({ to: target, replace: true })
    }
  }
  const verify = () => {
    const value = navigations % 2 ? 'b' : 'a'
    if (
      container.querySelector('[data-testid="ready-state"]')?.textContent !==
        `${value}:${value}` ||
      loaderCalls !== 2 * (depth - 1) ||
      imports !== (mode === 'lazy' ? 1 : 0) ||
      rendered !== navigations + 1
    ) {
      throw new Error(
        `Invalid browser workload: ${JSON.stringify({ mode, depth, loaderCalls, imports, rendered, navigations })}`,
      )
    }
  }
  await run(2)
  verify()
  return {
    run,
    verify,
    dispose() {
      unsubscribe()
      root.unmount()
      history.destroy()
      container.remove()
    },
  }
}
