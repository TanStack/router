import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('releases match-store subscriptions when route params replace a match', async () => {
  const observedIds: Array<string> = []
  const rootRoute = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      q: typeof search.q === 'string' ? search.q : '',
    }),
    loaderDeps: ({ search }) => ({ q: search.q }),
    loader: ({ deps }) => `root:${deps.q}`,
    component: RootComponent,
  })
  function RootComponent() {
    const rootData = rootRoute.useLoaderData()
    return (
      <section data-testid="root-data">
        {rootData.value}
        <Outlet />
      </section>
    )
  }
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      q: typeof search.q === 'string' ? search.q : '',
    }),
    loaderDeps: ({ search }) => ({ q: search.q }),
    loader: ({ params, deps }) => `${params.id}:${deps.q}`,
    component: ItemComponent,
  })
  function ItemComponent() {
    const id = itemRoute.useLoaderData()
    const rootData = rootRoute.useLoaderData()
    return (
      <button
        data-testid="item-id"
        onClick={() => observedIds.push(`${id.value}|${rootData.value}`)}
      >
        {`${id.value}|${rootData.value}`}
      </button>
    )
  }
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items/initial'] }),
    defaultGcTime: 0,
  })
  const matchStore = router.stores.getMatchStore('/items/$id')
  const originalSubscribe = matchStore.subscribe.bind(matchStore)
  let activeSubscriptions = 0
  let subscriptions = 0
  let unsubscriptions = 0

  matchStore.subscribe = (observer) => {
    subscriptions++
    activeSubscriptions++
    const subscription = Reflect.apply(originalSubscribe, matchStore, [
      observer,
    ]) as ReturnType<typeof matchStore.subscribe>
    let active = true

    return {
      unsubscribe() {
        if (active) {
          active = false
          activeSubscriptions--
          unsubscriptions++
        }
        subscription.unsubscribe()
      },
    }
  }

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('item-id')).toHaveTextContent(
    'initial:|root:',
  )
  const initialSubscriptions = activeSubscriptions

  for (let index = 0; index < 50; index++) {
    await router.navigate({
      to: '/items/$id',
      params: { id: `item-${index}` },
      search: { q: `query-${index}` },
      replace: true,
    })
  }
  expect(screen.getByTestId('item-id')).toHaveTextContent(
    'item-49:query-49|root:query-49',
  )
  expect(activeSubscriptions).toBe(initialSubscriptions)

  const subscriptionsAfterParamChanges = subscriptions
  for (let index = 0; index < 50; index++) {
    await router.navigate({
      to: '/items/$id',
      params: { id: 'item-49' },
      search: { q: `same-param-query-${index}` },
      replace: true,
    })
  }
  expect(screen.getByTestId('item-id')).toHaveTextContent(
    'item-49:same-param-query-49|root:same-param-query-49',
  )
  await fireEvent.click(screen.getByTestId('item-id'))
  expect(observedIds).toEqual([
    'item-49:same-param-query-49|root:same-param-query-49',
  ])

  expect(activeSubscriptions).toBe(initialSubscriptions)
  expect(subscriptions - unsubscriptions).toBe(initialSubscriptions)
  expect(subscriptions).toBe(subscriptionsAfterParamChanges)
})
