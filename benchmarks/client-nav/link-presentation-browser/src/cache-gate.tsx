import { createRoot } from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '@tanstack/react-router'
import type { AnyRouter } from '@tanstack/react-router'

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function runCase(
  kind: 'static' | 'validation' | 'middleware' | 'added-stringifier',
) {
  let validationCalls = 0
  let middlewareCalls = 0
  let stringifyCalls = 0
  const loads: Array<{ preload: boolean; search: unknown }> = []
  const options = Object.freeze({
    to: kind === 'added-stringifier' ? '/target/$id' : '/target',
    ...(kind === 'added-stringifier' ? { params: { id: '1' } } : {}),
    search: Object.freeze({}),
    preload: 'intent' as const,
  })
  function Navigation() {
    const props = useLinkProps<AnyRouter, string, string>(options)
    return (
      <>
        <a {...props} id="gate-destination">
          target
        </a>
        <Outlet />
      </>
    )
  }
  const root = createRootRoute({ component: Navigation })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>source</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: kind === 'added-stringifier' ? '/target/$id' : '/target',
    ...(kind === 'validation'
      ? {
          validateSearch: (search: Record<string, unknown>) => {
            validationCalls++
            return { page: Number(search.page ?? 2) }
          },
        }
      : {}),
    ...(kind === 'middleware'
      ? {
          search: {
            middlewares: [
              ({ search, next }: any) => {
                middlewareCalls++
                return { ...next(search), page: 7 }
              },
            ],
          },
        }
      : {}),
    loaderDeps: ({ search }) => search,
    loader: ({ preload, deps }) => {
      loads.push({ preload, search: deps })
    },
    staleTime: 0,
    component: () => <div id="gate-target">target content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })
  // Untimed forwarding diagnostics of the public API: preserve every argument
  // and result, and observe object reuse without reading cache internals.
  const builds: Array<unknown> = []
  const build = router.buildLocation
  router.buildLocation = ((...args: any[]) => {
    const result = (build as any)(...args)
    builds.push(result)
    return result
  }) as typeof router.buildLocation
  const host = document.createElement('div')
  document.getElementById('app')!.append(host)
  const react = createRoot(host)
  const rendered = () =>
    new Promise<void>((resolve) => {
      const stop = router.subscribe('onRendered', () => {
        stop()
        resolve()
      })
    })
  const initial = rendered()
  react.render(<RouterProvider router={router} />)
  await initial
  const anchor = host.querySelector<HTMLAnchorElement>('#gate-destination')!
  const displayed = anchor.getAttribute('href')
  anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  for (
    let index = 0;
    index < 100 && !loads.some((load) => load.preload);
    index++
  ) {
    await turn()
  }
  if (!loads.some((load) => load.preload)) {
    throw new Error(`${kind}: preload did not execute`)
  }
  // A public route update introduces a callback after the displayed target
  // was built. A previously reusable result must now take the full path.
  if (kind === 'added-stringifier') {
    target.update({
      params: {
        stringify: (params) => {
          stringifyCalls++
          return { ...params, id: `v-${params.id}` }
        },
      },
    })
  }
  const previous = new Set(builds)
  const start = builds.length
  const beforeValidation = validationCalls
  const beforeMiddleware = middlewareCalls
  const committed = rendered()
  anchor.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
  )
  await committed
  await turn()
  const expected =
    kind === 'validation'
      ? { page: 2 }
      : kind === 'middleware'
        ? { page: 7 }
        : {}
  if (
    JSON.stringify(router.state.location.search) !== JSON.stringify(expected) ||
    !host.querySelector('#gate-target')
  ) {
    throw new Error(
      `${kind}: incorrect committed output ${JSON.stringify(router.state.location.search)}`,
    )
  }
  if (kind === 'validation' && validationCalls <= beforeValidation) {
    throw new Error('Click skipped validation')
  }
  if (kind === 'middleware' && middlewareCalls <= beforeMiddleware) {
    throw new Error('Click skipped middleware')
  }
  if (
    kind === 'added-stringifier' &&
    (router.state.location.pathname !== '/target/v-1' ||
      !stringifyCalls ||
      previous.has(builds[start]))
  ) {
    throw new Error('Click reused the result after a stringifier was added')
  }
  if (Object.keys(options).some((key) => key.startsWith('_'))) {
    throw new Error('Borrowed options mutated')
  }
  const result = {
    displayed,
    committed: router.state.location.href,
    search: router.state.location.search,
    reusedPublicResult: previous.has(builds[start]),
    clickValidationCalls: validationCalls - beforeValidation,
    clickMiddlewareCalls: middlewareCalls - beforeMiddleware,
    clickStringifyCalls: stringifyCalls,
    loads,
  }
  react.unmount()
  host.remove()
  router.history.destroy()
  await turn()
  return result
}

Object.assign(window, {
  linkPresentationCacheGate: {
    async check() {
      const results = {}
      for (const kind of [
        'static',
        'validation',
        'middleware',
        'added-stringifier',
      ] as const) {
        Object.assign(results, { [kind]: await runCase(kind) })
      }
      return results
    },
  },
})
