import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

import { createEffect, onMount } from 'solid-js'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

import { sleep } from './utils'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})
afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
  vi.resetAllMocks()
  cleanup()
})

const WAIT_TIME = 150

describe('context function', () => {
  describe('context is executed', () => {
    async function findByText(text: string) {
      const element = await screen.findByText(text)
      expect(element).toBeInTheDocument()
    }

    async function clickButton(name: string) {
      const button = await screen.findByRole('button', {
        name,
      })
      expect(button).toBeInTheDocument()
      fireEvent.click(button)
    }

    test('when the path params change', async () => {
      const mockContextFn = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <h1>Index page</h1>

              <button
                onClick={() =>
                  navigate({ to: '/detail/$id', params: { id: 1 } })
                }
              >
                detail-1
              </button>
            </div>
          )
        },
      })
      const detailRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/detail/$id',
        params: {
          parse: (p) => z.object({ id: z.coerce.number() }).parse(p),
          stringify: (p) => ({ id: `${p.id}` }),
        },
        context: (args) => {
          mockContextFn(args.params)
        },
        component: () => {
          const id = detailRoute.useParams({ select: (params) => params.id })
          const navigate = detailRoute.useNavigate()
          return (
            <div>
              <h1>Detail page: {id()}</h1>
              <button
                onClick={() =>
                  navigate({
                    to: '/detail/$id',
                    params: (p: any) => ({ ...p, id: p.id + 1 }),
                  })
                }
              >
                next
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute, detailRoute])
      const router = createRouter({ routeTree, history })

      await render(() => <RouterProvider router={router} />)

      await findByText('Index page')
      expect(mockContextFn).not.toHaveBeenCalled()

      await clickButton('detail-1')

      await findByText('Detail page: 1')
      console.log(mockContextFn.mock.calls)
      expect(mockContextFn).toHaveBeenCalledOnce()
      expect(mockContextFn).toHaveBeenCalledWith({ id: 1 })
      mockContextFn.mockClear()
      await clickButton('next')

      await findByText('Detail page: 2')
      expect(mockContextFn).toHaveBeenCalledOnce()
      expect(mockContextFn).toHaveBeenCalledWith({ id: 2 })
      mockContextFn.mockClear()
      await clickButton('next')

      await findByText('Detail page: 3')
      expect(mockContextFn).toHaveBeenCalledOnce()
      expect(mockContextFn).toHaveBeenCalledWith({ id: 3 })
      mockContextFn.mockClear()
    })

    test('when loader deps change', async () => {
      const mockContextFn = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        validateSearch: z.object({
          foo: z.string().optional(),
          bar: z.string().optional(),
        }),
        path: '/',
        loaderDeps: ({ search }) => ({ foo: search.foo }),
        context: {
          handler: () => {
            mockContextFn()
          },
          invalidate: true,
        },
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <h1>Index page</h1>
              <h2>search: {JSON.stringify(indexRoute.useSearch()())}</h2>
              <button
                onClick={() => {
                  navigate({ search: (p: any) => ({ ...p, foo: 'foo-1' }) })
                }}
              >
                foo-1
              </button>
              <button
                onClick={() => {
                  navigate({ search: (p: any) => ({ ...p, foo: 'foo-2' }) })
                }}
              >
                foo-2
              </button>
              <button
                onClick={() => {
                  navigate({ search: (p: any) => ({ ...p, bar: 'bar-1' }) })
                }}
              >
                bar-1
              </button>
              <button
                onClick={() => {
                  navigate({ search: (p: any) => ({ ...p, bar: 'bar-2' }) })
                }}
              >
                bar-2
              </button>
              <button
                onClick={() => {
                  navigate({ search: {} })
                }}
              >
                clear
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await findByText('Index page')
      await findByText(`search: ${JSON.stringify({})}`)

      expect(mockContextFn).toHaveBeenCalledOnce()
      mockContextFn.mockClear()

      await clickButton('foo-1')
      await findByText(`search: ${JSON.stringify({ foo: 'foo-1' })}`)
      expect(mockContextFn).toHaveBeenCalledOnce()

      mockContextFn.mockClear()
      await clickButton('foo-1')
      await findByText(`search: ${JSON.stringify({ foo: 'foo-1' })}`)
      expect(mockContextFn).not.toHaveBeenCalled()

      await clickButton('bar-1')
      await findByText(
        `search: ${JSON.stringify({ foo: 'foo-1', bar: 'bar-1' })}`,
      )
      expect(mockContextFn).not.toHaveBeenCalled()

      await clickButton('foo-2')
      await findByText(
        `search: ${JSON.stringify({ foo: 'foo-2', bar: 'bar-1' })}`,
      )
      expect(mockContextFn).toHaveBeenCalledOnce()
      mockContextFn.mockClear()

      await clickButton('bar-2')
      await findByText(
        `search: ${JSON.stringify({ foo: 'foo-2', bar: 'bar-2' })}`,
      )
      expect(mockContextFn).not.toHaveBeenCalled()

      await clickButton('clear')
      await findByText(`search: ${JSON.stringify({})}`)
      // context with invalidate does NOT re-run: the cached match (from the initial load with
      // the same loaderDeps hash) is restored and the context is already consumed.
      expect(mockContextFn).not.toHaveBeenCalled()
    })
  })

  describe('accessing values in the context function', () => {
    test('receives an empty object', async () => {
      const mockIndexContextFn = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => {
          mockIndexContextFn(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Index page')
      expect(rootElement).toBeInTheDocument()

      expect(mockIndexContextFn).toHaveBeenCalledWith({})
    })

    test('receives an empty object - with an empty object when creating the router', async () => {
      const mockIndexContextFn = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => {
          mockIndexContextFn(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history, context: {} })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Index page')
      expect(rootElement).toBeInTheDocument()

      expect(mockIndexContextFn).toHaveBeenCalledWith({})
    })

    test('receives valid values - with values added when creating the router', async () => {
      const mockIndexContextFn = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => {
          mockIndexContextFn(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'Router' },
      })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Index page')
      expect(rootElement).toBeInTheDocument()

      expect(mockIndexContextFn).toHaveBeenCalledWith({ project: 'Router' })
    })

    test('receives valid values when updating the values in the parent route to be read in the child route', async () => {
      const mockIndexContextFn = vi.fn()

      const rootRoute = createRootRoute({
        context: () => ({
          project: 'Router',
        }),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => {
          mockIndexContextFn(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Index page')
      expect(rootElement).toBeInTheDocument()

      expect(mockIndexContextFn).toHaveBeenCalledWith({ project: 'Router' })
    })
  })

  describe('return values being available in beforeLoad', () => {
    test('when returning an empty object in a regular route', async () => {
      const mockIndexBeforeLoad = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => ({}),
        beforeLoad: ({ context }) => {
          mockIndexBeforeLoad(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'foo' },
      })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Index page')
      expect(rootElement).toBeInTheDocument()

      expect(mockIndexBeforeLoad).toHaveBeenCalledWith({ project: 'foo' })
      expect(mockIndexBeforeLoad).toHaveBeenCalledTimes(1)
    })

    test('when updating the initial router context value in a regular route', async () => {
      const mockIndexBeforeLoad = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => ({ ...context, project: 'Query' }),
        beforeLoad: ({ context }) => {
          mockIndexBeforeLoad(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'foo' },
      })

      render(() => <RouterProvider router={router} />)

      const indexElement = await screen.findByText('Index page')
      expect(indexElement).toBeInTheDocument()

      expect(mockIndexBeforeLoad).toHaveBeenCalledWith({ project: 'Query' })
      expect(mockIndexBeforeLoad).toHaveBeenCalledTimes(1)
    })

    test('when returning an empty object in the root route', async () => {
      const mock = vi.fn()

      const rootRoute = createRootRoute({
        context: () => ({}),
        beforeLoad: ({ context }) => {
          mock(context)
        },
        component: () => <div>Root page</div>,
      })
      const routeTree = rootRoute.addChildren([])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'foo' },
      })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Root page')
      expect(rootElement).toBeInTheDocument()

      expect(mock).toHaveBeenCalledWith({ project: 'foo' })
      expect(mock).toHaveBeenCalledTimes(1)
    })

    test('when updating the initial router context value in the parent route and in the child route', async () => {
      const mockRootBeforeLoad = vi.fn()
      const mockIndexBeforeLoad = vi.fn()

      const rootRoute = createRootRoute({
        context: ({ context }) => ({ ...context, project: 'Router' }),
        beforeLoad: ({ context }) => {
          mockRootBeforeLoad(context)
        },
        component: () => (
          <div>
            Root page <Outlet />
          </div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => ({ ...context, project: 'Query' }),
        beforeLoad: ({ context }) => {
          mockIndexBeforeLoad(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'bar' },
      })

      render(() => <RouterProvider router={router} />)

      const indexElement = await screen.findByText('Index page')
      expect(indexElement).toBeInTheDocument()

      expect(mockRootBeforeLoad).toHaveBeenCalledWith({ project: 'Router' })
      expect(mockRootBeforeLoad).toHaveBeenCalledTimes(1)

      expect(mockIndexBeforeLoad).toHaveBeenCalledWith({ project: 'Query' })
      expect(mockIndexBeforeLoad).toHaveBeenCalledTimes(1)
    })
  })

  describe('return values being available in loader', () => {
    test('when returning an empty object in a regular route', async () => {
      const mockIndexLoader = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => ({}),
        loader: ({ context }) => {
          mockIndexLoader(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'foo' },
      })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Index page')
      expect(rootElement).toBeInTheDocument()

      expect(mockIndexLoader).toHaveBeenCalledWith({ project: 'foo' })
      expect(mockIndexLoader).toHaveBeenCalledTimes(1)
    })

    test('when updating the initial router context value in a regular route', async () => {
      const mockIndexLoader = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => ({ ...context, project: 'Query' }),
        loader: ({ context }) => {
          mockIndexLoader(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'foo' },
      })

      render(() => <RouterProvider router={router} />)

      const indexElement = await screen.findByText('Index page')
      expect(indexElement).toBeInTheDocument()

      expect(mockIndexLoader).toHaveBeenCalledWith({ project: 'Query' })
      expect(mockIndexLoader).toHaveBeenCalledTimes(1)
    })

    test('when returning an empty object in the root route', async () => {
      const mockRootLoader = vi.fn()

      const rootRoute = createRootRoute({
        context: () => ({}),
        loader: ({ context }) => {
          mockRootLoader(context)
        },
        component: () => <div>Root page</div>,
      })
      const routeTree = rootRoute.addChildren([])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'foo' },
      })

      render(() => <RouterProvider router={router} />)

      const rootElement = await screen.findByText('Root page')
      expect(rootElement).toBeInTheDocument()

      expect(mockRootLoader).toHaveBeenCalledWith({ project: 'foo' })
      expect(mockRootLoader).toHaveBeenCalledTimes(1)
    })

    test('when updating the initial router context value in the root route and in the child route', async () => {
      const mockRootLoader = vi.fn()
      const mockIndexLoader = vi.fn()

      const rootRoute = createRootRoute({
        context: ({ context }) => ({ ...context, project: 'Router' }),
        loader: ({ context }) => {
          mockRootLoader(context)
        },
        component: () => (
          <div>
            Root page <Outlet />
          </div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: ({ context }) => ({ ...context, project: 'Query' }),
        loader: ({ context }) => {
          mockIndexLoader(context)
        },
        component: () => <div>Index page</div>,
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({
        routeTree,
        history,
        context: { project: 'bar' },
      })

      render(() => <RouterProvider router={router} />)

      const indexElement = await screen.findByText('Index page')
      expect(indexElement).toBeInTheDocument()

      expect(mockRootLoader).toHaveBeenCalledWith({ project: 'Router' })
      expect(mockRootLoader).toHaveBeenCalledTimes(1)

      expect(mockIndexLoader).toHaveBeenCalledWith({ project: 'Query' })
      expect(mockIndexLoader).toHaveBeenCalledTimes(1)
    })
  })
})

describe('beforeLoad in the route definition', () => {
  // Present at the root route
  test('route context, present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: ({ context }) => {
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Present at the index route
  test('route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: ({ context }) => {
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context that is updated at the root, is the same in the index route
  test('modified route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'sean' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context the context is available after a redirect on first-load
  test('on first-load, route context is present in the /about route after a redirect is thrown in the beforeLoad of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on first-load, route context is present in the /about route after a redirect is thrown in the loader of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context the context is available after a redirect on navigate
  test('on navigate, route context is present in the /person route after a redirect is thrown in the beforeLoad of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on navigate, route context is present in the /person route after a redirect is thrown in the loader of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by /nested/about, is the same as its parent route /nested on navigate
  test('nested destination on navigate, route context in the /nested/about route is correctly inherited from the /nested parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/nested/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/about')
    expect(window.location.pathname).toBe('/nested/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by /nested/person route, is the same as its parent route /nested on navigate after a redirect /about
  test('nested destination on navigate, when a redirect is thrown in beforeLoad in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('nested destination on navigate, when a redirect is thrown in loader in /about, the /nested/person route context is correctly inherited from parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (index route) on first-load
  test('_layout on first-load, route context in the index route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on navigate
  test('_layout on navigate, route context in the /about route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('_layout on navigate, when a redirect is thrown in beforeLoad in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('_layout on navigate, when a redirect is thrown in loader in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('child route receives updated values after the values were previously returned by the child route and then updated by the parent route', async () => {
    const mockIndexBeforeLoadFn = vi.fn()
    let counter = 0

    const rootRoute = createRootRoute({
      beforeLoad: () => {
        counter++
        return {
          counter,
        }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: ({ context }) => {
        mockIndexBeforeLoadFn(context)
        return {
          counter: context.counter,
        }
      },
      component: () => {
        const context = indexRoute.useRouteContext()
        return (
          <div>
            <span data-testid="index-page">Index page</span>
            <span data-testid="counter">{context().counter}</span>
          </div>
        )
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history })

    render(() => <RouterProvider router={router} />)

    const rootElement = await screen.findByTestId('index-page')
    expect(rootElement).toBeInTheDocument()

    async function check(expectedCounter: number) {
      const counterElement = await screen.findByTestId('counter')
      expect(counterElement).toHaveTextContent(`${expectedCounter}`)

      expect(mockIndexBeforeLoadFn).toHaveBeenCalledWith({
        counter: expectedCounter,
      })
    }

    await check(1)
    await router.invalidate()
    await check(2)
  })
})

describe('loader in the route definition', () => {
  // Present at the root route
  test('route context, present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      loader: ({ context }) => {
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Present at the index route
  test('route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: ({ context }) => {
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context that is updated at the root, is the same in the index route
  test('modified route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'sean' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // disabled test due to flakiness
  test.skip("on navigate (with preload using router methods), loader isn't invoked with undefined context if beforeLoad is pending when navigation happens", async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aboutRoute = createRoute({
      ssr: false,
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        return { mock }
      },
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        expect(context.mock).toBe(mock)
        context.mock()
      },
    })

    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({
      routeTree,
      history,
      context: { foo: 'bar' },
    })

    await router.load()

    // Don't await, simulate user clicking before preload is done
    router.preloadRoute(aboutRoute)

    await router.navigate(aboutRoute)
    await router.invalidate()

    // Expect only a single call as the one from preload and the one from navigate are deduped
    expect(mock).toHaveBeenCalledOnce()
  })

  test("on navigate (with preload), loader isn't invoked with undefined context if beforeLoad is pending when navigation happens", async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about" preload="intent">
              link to about
            </Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      ssr: false,
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        return { mock }
      },
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        expect(context.mock).toBe(mock)
        context.mock()
      },
      component: () => <div>About page</div>,
    })

    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({
      routeTree,
      history,
      defaultPreload: 'intent',
      context: { foo: 'bar' },
    })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()

    // Don't await, simulate user clicking before preload is done
    fireEvent.focus(linkToAbout)
    fireEvent.click(linkToAbout)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')

    // Expect only a single call as the one from preload and the one from navigate are deduped
    expect(mock).toHaveBeenCalledOnce()
  })

  // Check if context the context is available after a redirect on first-load
  test('on first-load, route context is present in the /about route after a redirect is thrown in beforeLoad of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on first-load, route context is present in the /about route after a redirect is thrown in loader of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context the context is available after a redirect on navigate
  test('on navigate, route context is present in the /person route after a redirect is thrown in the beforeLoad of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on navigate, route context is present in the /person route after a redirect is thrown in the loader of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a /nested/about, is the same as its parent route /nested on navigate
  test('nested destination on navigate, route context in the /nested/about route is correctly inherited from the /nested parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/nested/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/about')
    expect(window.location.pathname).toBe('/nested/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a /nested/person route, is the same as its parent route /nested on navigate after a redirect /about
  test('nested destination on navigate, when a redirect is thrown in beforeLoad in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('nested destination on navigate, when a redirect is thrown in loader in /about, the /nested/person route context is correctly inherited from parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (index route) on first-load
  test('_layout on first-load, route context in the index route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on navigate
  test('_layout on navigate, route context in the /about route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('_layout on navigate, when a redirect is thrown in beforeLoad in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('_layout on navigate, when a redirect is thrown in loader in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    fireEvent.click(buttonToAbout)

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe('useRouteContext in the component', () => {
  // Present at the root route
  test('route context, present in the root route', async () => {
    const rootRoute = createRootRoute({
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  test('route context (sleep in beforeLoad), present in the root route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  // Note: This test passes in solid-router but fails in react-router, even
  // though in issue (GitHub #6040), the bug manifests in both routers.
  test('route context, (sleep in beforeLoad), with immediate navigation', async () => {
    const contextValues: Array<{ data: string }> = []

    const rootRoute = createRootRoute({
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        return { data: 'context-from-beforeLoad' }
      },
      shellComponent: () => {
        const context = rootRoute.useRouteContext()

        // Track context value at render time
        createEffect(() => {
          const contextValue: { data: string } = context()
          contextValues.push(contextValue)
        })

        return <Outlet />
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()

        // Navigate away immediately on mount
        onMount(() => {
          navigate({ to: '/other' })
        })

        return <div>Index page</div>
      },
    })

    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <div>Other page</div>,
    })

    const routeTree = rootRoute.addChildren([indexRoute, otherRoute])
    const router = createRouter({ routeTree, history })

    render(() => <RouterProvider router={router} />)

    // Wait for navigation to complete
    await screen.findByText('Other page')

    const allContextsValid = contextValues.every(
      (c) => c.data === 'context-from-beforeLoad',
    )
    expect(allContextsValid).toBe(true)
  })

  test('route context (sleep in loader), present root route', async () => {
    const rootRoute = createRootRoute({
      loader: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  // Present at the index route
  test('route context, present in the index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const context = indexRoute.useRouteContext()

        if (context === undefined) {
          throw new Error('context is undefined')
        }
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  test('route context (sleep in beforeLoad), present in the index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  test('route context (sleep in loader), present in the index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  // Check if context that is updated at the root, is the same in the root route
  test('modified route context, present in the root route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })

    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'sean' }))

    expect(content).toBeInTheDocument()
  })

  // Check if the context that is updated at the root, is the same in the index route
  test('modified route context, present in the index route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'sean' }))

    expect(content).toBeInTheDocument()
  })

  // Check if the context that is available after a redirect on first-load
  test('on first-load, route context is present in the /about route after a redirect is thrown in the beforeLoad of the index route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(content).toBeInTheDocument()
  })

  test('on first-load, route context is present in the /about route after a redirect is thrown in the loader of the index route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(content).toBeInTheDocument()
  })

  // Check if the context that is available after a redirect on navigate
  test('on navigate, route context is present in the /person route after a redirect is thrown in the beforeLoad of the /about route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))
    expect(content).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')
  })

  test('on navigate, route context is present in the /person route after a redirect is thrown in the loader of the /about route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))
    expect(content).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')
  })

  // Check if context returned by /nested/about, is the same its parent /nested on navigate
  test('nested destination on navigate, route context in the /nested/about route is correctly inherited from its parent /nested', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/nested/about">link to about</Link>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
      component: () => <Outlet />,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })

    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'nested' }),
    )

    expect(router.state.location.href).toBe('/nested/about')
    expect(window.location.pathname).toBe('/nested/about')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('nested destination on navigate, when a redirect is thrown in beforeLoad in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'nested' }),
    )

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(content).toBeInTheDocument()
  })

  test('nested destination on navigate, when a redirect is thrown in loader in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'nested' }),
    )

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (index route) on first-load
  test('_layout on first-load, route context in the index route is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (about route) on navigate
  test('_layout on navigate, route context in the /about route is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('_layout on navigate, when a redirect is thrown in beforeLoad in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(content).toBeInTheDocument()
  })

  test('_layout on navigate, when a redirect is thrown in loader in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context())}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, history, context: { foo: 'bar' } })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(content).toBeInTheDocument()
  })
})

describe('lifecycle method semantics', () => {
  describe('execution order guarantees', () => {
    test('parent serial phases complete before child serial phases (parent context → beforeLoad → child context → beforeLoad)', async () => {
      const executionOrder: Array<string> = []

      const rootRoute = createRootRoute({
        component: () => (
          <div>
            <Outlet />
          </div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-parent-child"
                onClick={() => navigate({ to: '/parent/child' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const parentRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: async () => {
          executionOrder.push('parent-context-start')
          await sleep(WAIT_TIME)
          executionOrder.push('parent-context-end')
          return { parentContext: true }
        },
        beforeLoad: async () => {
          executionOrder.push('parent-beforeLoad-start')
          await sleep(WAIT_TIME)
          executionOrder.push('parent-beforeLoad-end')
          return { parentBeforeLoad: true }
        },
        component: () => (
          <div>
            Parent <Outlet />
          </div>
        ),
      })
      const childRoute = createRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        context: async () => {
          executionOrder.push('child-context-start')
          await sleep(WAIT_TIME)
          executionOrder.push('child-context-end')
          return { childContext: true }
        },
        beforeLoad: async () => {
          executionOrder.push('child-beforeLoad-start')
          await sleep(WAIT_TIME)
          executionOrder.push('child-beforeLoad-end')
          return { childBeforeLoad: true }
        },
        component: () => <div data-testid="child-page">Child page</div>,
      })

      const routeTree = rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)
      await screen.findByTestId('index-page')

      // Clear any entries from initial load
      executionOrder.length = 0

      fireEvent.click(screen.getByTestId('go-parent-child'))
      await screen.findByTestId('child-page')

      expect(executionOrder).toEqual([
        'parent-context-start',
        'parent-context-end',
        'parent-beforeLoad-start',
        'parent-beforeLoad-end',
        'child-context-start',
        'child-context-end',
        'child-beforeLoad-start',
        'child-beforeLoad-end',
      ])
    })

    test('all serial phases complete before loaders fire', async () => {
      const executionOrder: Array<string> = []

      const rootRoute = createRootRoute({
        component: () => (
          <div>
            <Outlet />
          </div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-parent-child"
                onClick={() => navigate({ to: '/parent/child' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const parentRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: () => {
          executionOrder.push('parent-context')
          return {}
        },
        beforeLoad: () => {
          executionOrder.push('parent-beforeLoad')
          return {}
        },
        loader: () => {
          executionOrder.push('parent-loader')
        },
        component: () => (
          <div>
            Parent <Outlet />
          </div>
        ),
      })
      const childRoute = createRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        context: () => {
          executionOrder.push('child-context')
          return {}
        },
        beforeLoad: () => {
          executionOrder.push('child-beforeLoad')
          return {}
        },
        loader: () => {
          executionOrder.push('child-loader')
        },
        component: () => <div data-testid="child-page">Child page</div>,
      })

      const routeTree = rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)
      await screen.findByTestId('index-page')

      // Clear any entries from initial load
      executionOrder.length = 0

      fireEvent.click(screen.getByTestId('go-parent-child'))
      await screen.findByTestId('child-page')

      // All serial phases (context, beforeLoad) must come before any loader
      const loaderIndices = executionOrder
        .map((entry, i) => (entry.includes('loader') ? i : -1))
        .filter((i) => i >= 0)
      const serialIndices = executionOrder
        .map((entry, i) => (!entry.includes('loader') ? i : -1))
        .filter((i) => i >= 0)

      const lastSerial = Math.max(...serialIndices)
      const firstLoader = Math.min(...loaderIndices)
      expect(lastSerial).toBeLessThan(firstLoader)
    })
  })

  describe('context edge cases', () => {
    test('context on root route fires exactly once and never again on navigation', async () => {
      const mockRootContext = vi.fn()

      const rootRoute = createRootRoute({
        context: () => {
          mockRootContext()
          return { rootMatched: true }
        },
        component: () => (
          <div>
            Root <Outlet />
          </div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-other"
                onClick={() => navigate({ to: '/other' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        component: () => {
          const navigate = otherRoute.useNavigate()
          return (
            <div>
              <span data-testid="other-page">Other</span>
              <button
                data-testid="go-index"
                onClick={() => navigate({ to: '/' })}
              >
                go
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute, otherRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')
      expect(mockRootContext).toHaveBeenCalledTimes(1)
      mockRootContext.mockClear()

      // Navigate to other
      fireEvent.click(await screen.findByTestId('go-other'))
      await screen.findByTestId('other-page')
      expect(mockRootContext).not.toHaveBeenCalled()

      // Navigate back
      fireEvent.click(await screen.findByTestId('go-index'))
      await screen.findByTestId('index-page')
      expect(mockRootContext).not.toHaveBeenCalled()
    })

    test('context returning undefined does not clobber parent context', async () => {
      const rootRoute = createRootRoute({
        beforeLoad: () => ({ rootValue: 'from-root' }),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => {
          return undefined
        },
        beforeLoad: ({ context }) => {
          return { sawRootValue: context.rootValue }
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      const context = JSON.parse(contextEl.textContent)
      expect(context).toEqual(
        expect.objectContaining({
          rootValue: 'from-root',
          sawRootValue: 'from-root',
        }),
      )
    })

    test('context receives cause "enter" on fresh match creation', async () => {
      const receivedCause = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-other"
                onClick={() => navigate({ to: '/other' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        context: ({ cause }) => {
          receivedCause(cause)
        },
        component: () => <div data-testid="other-page">Other</div>,
      })

      const routeTree = rootRoute.addChildren([indexRoute, otherRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')

      fireEvent.click(await screen.findByTestId('go-other'))
      await screen.findByTestId('other-page')

      expect(receivedCause).toHaveBeenCalledTimes(1)
      expect(receivedCause).toHaveBeenCalledWith('enter')
    })

    test('context receives correct params', async () => {
      const receivedParams = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-user"
                onClick={() =>
                  navigate({ to: '/user/$userId', params: { userId: '42' } })
                }
              >
                go
              </button>
            </div>
          )
        },
      })
      const userRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/user/$userId',
        context: ({ params }) => {
          receivedParams(params)
          return { userId: params.userId }
        },
        component: () => {
          const context = userRoute.useRouteContext()
          return (
            <div data-testid="user-context">{JSON.stringify(context())}</div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute, userRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')

      fireEvent.click(await screen.findByTestId('go-user'))
      const contextEl = await screen.findByTestId('user-context')
      const context = JSON.parse(contextEl.textContent)

      expect(receivedParams).toHaveBeenCalledWith({ userId: '42' })
      expect(context).toEqual(expect.objectContaining({ userId: '42' }))
    })
  })

  describe('context with invalidate edge cases', () => {
    test('context with invalidate re-runs when loaderDeps change (new matchId)', async () => {
      const mockContext = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        validateSearch: z.object({
          page: z.number().optional(),
        }),
        loaderDeps: ({ search }) => ({ page: search.page }),
        context: {
          handler: () => {
            mockContext()
            return { loadedPage: undefined }
          },
          invalidate: true,
        },
        component: () => {
          const navigate = indexRoute.useNavigate()
          const search = indexRoute.useSearch()
          return (
            <div>
              <span data-testid="search">{JSON.stringify(search())}</span>
              <button
                data-testid="go-page-1"
                onClick={() => navigate({ search: { page: 1 } })}
              >
                page 1
              </button>
              <button
                data-testid="go-page-2"
                onClick={() => navigate({ search: { page: 2 } })}
              >
                page 2
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await waitFor(() => {
        expect(screen.getByTestId('search')).toBeInTheDocument()
      })
      expect(mockContext).toHaveBeenCalledTimes(1)
      mockContext.mockClear()

      fireEvent.click(await screen.findByTestId('go-page-1'))
      await waitFor(() => {
        expect(screen.getByTestId('search').textContent).toBe(
          JSON.stringify({ page: 1 }),
        )
      })
      expect(mockContext).toHaveBeenCalledTimes(1)
      mockContext.mockClear()

      fireEvent.click(await screen.findByTestId('go-page-2'))
      await waitFor(() => {
        expect(screen.getByTestId('search').textContent).toBe(
          JSON.stringify({ page: 2 }),
        )
      })
      expect(mockContext).toHaveBeenCalledTimes(1)
    })

    test('context with invalidate re-runs after GC', async () => {
      const mockContext = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => {
            mockContext()
          },
          invalidate: true,
        },
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-other"
                onClick={() => navigate({ to: '/other' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        component: () => {
          const navigate = otherRoute.useNavigate()
          return (
            <div>
              <span data-testid="other-page">Other</span>
              <button
                data-testid="go-index"
                onClick={() => navigate({ to: '/' })}
              >
                go
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute, otherRoute])
      const router = createRouter({ routeTree, history, defaultGcTime: 0 })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')
      expect(mockContext).toHaveBeenCalledTimes(1)
      mockContext.mockClear()

      fireEvent.click(await screen.findByTestId('go-other'))
      await screen.findByTestId('other-page')

      fireEvent.click(await screen.findByTestId('go-index'))
      await screen.findByTestId('index-page')
      expect(mockContext).toHaveBeenCalledTimes(1)
    })

    test('context returning undefined does not clobber context from beforeLoad', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => {
          return { fromContext: 'match-val' }
        },
        beforeLoad: () => {
          return { fromBeforeLoad: 'bl-val' }
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      const context = JSON.parse(contextEl.textContent)
      expect(context).toEqual(
        expect.objectContaining({
          fromContext: 'match-val',
          fromBeforeLoad: 'bl-val',
        }),
      )
    })

    test('context with invalidate receives correct deps (loaderDeps)', async () => {
      const receivedDeps = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        validateSearch: z.object({ sort: z.string().optional() }),
        loaderDeps: ({ search }) => ({ sort: search.sort }),
        context: {
          handler: () => {
            receivedDeps()
          },
          invalidate: true,
        },
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="set-sort"
                onClick={() => navigate({ search: { sort: 'name' } })}
              >
                sort
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')
      expect(receivedDeps).toHaveBeenCalledTimes(1)
      receivedDeps.mockClear()

      fireEvent.click(await screen.findByTestId('set-sort'))
      await waitFor(() => {
        expect(receivedDeps).toHaveBeenCalledTimes(1)
      })
    })

    test('context with invalidate receives cause "enter" on fresh navigation', async () => {
      const receivedCause = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-other"
                onClick={() => navigate({ to: '/other' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        context: {
          handler: ({ cause }) => {
            receivedCause(cause)
          },
          invalidate: true,
        },
        component: () => <div data-testid="other-page">Other</div>,
      })

      const routeTree = rootRoute.addChildren([indexRoute, otherRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')

      fireEvent.click(await screen.findByTestId('go-other'))
      await screen.findByTestId('other-page')

      expect(receivedCause).toHaveBeenCalledTimes(1)
      expect(receivedCause).toHaveBeenCalledWith('enter')
    })
  })

  describe('context visibility per callback', () => {
    test('beforeLoad sees context return from same route', async () => {
      const beforeLoadContext = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => {
          return { fromContext: 'visible' }
        },
        beforeLoad: ({ context }) => {
          beforeLoadContext(context)
          return { fromBeforeLoad: 'bl' }
        },
        component: () => <div data-testid="index-page">Index</div>,
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')

      expect(beforeLoadContext).toHaveBeenCalledWith(
        expect.objectContaining({ fromContext: 'visible' }),
      )
    })

    test('loader sees context + beforeLoad from same route', async () => {
      const loaderContext = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => {
          return { fromContext: 'ctx' }
        },
        beforeLoad: () => {
          return { fromBeforeLoad: 'bl' }
        },
        loader: ({ context }) => {
          loaderContext(context)
        },
        component: () => <div data-testid="index-page">Index</div>,
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')

      expect(loaderContext).toHaveBeenCalledWith(
        expect.objectContaining({
          fromContext: 'ctx',
          fromBeforeLoad: 'bl',
        }),
      )
    })

    test('context does NOT see same-route beforeLoad (only parent full context)', async () => {
      const childContextCallback = vi.fn()

      const rootRoute = createRootRoute()
      const parentRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: () => ({ parentContext: 'pctx' }),
        beforeLoad: () => ({ parentBeforeLoad: 'pbl' }),
        component: () => (
          <div>
            Parent <Outlet />
          </div>
        ),
      })
      const childRoute = createRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        context: ({ context }) => {
          childContextCallback(context)
          return { childContext: 'cctx' }
        },
        beforeLoad: () => ({ childBeforeLoad: 'cbl' }),
        component: () => <div data-testid="child-page">Child</div>,
      })

      const routeTree = rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
      ])
      const router = createRouter({ routeTree, history })

      await router.navigate({ to: '/parent/child' })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('child-page')

      expect(childContextCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          parentContext: 'pctx',
          parentBeforeLoad: 'pbl',
        }),
      )
      const calledWith = childContextCallback.mock.calls[0]![0]
      expect(calledWith).not.toHaveProperty('childBeforeLoad')
      expect(calledWith).not.toHaveProperty('childContext')
    })
  })

  describe('parent-child selective GC', () => {
    test('when child match is GC-ed but parent is not, only child context re-runs', async () => {
      const parentContext = vi.fn()
      const childContext = vi.fn()

      const rootRoute = createRootRoute({
        component: () => (
          <div>
            <Outlet />
          </div>
        ),
      })
      const parentRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: () => {
          parentContext()
          return { parentMatched: true }
        },
        component: () => (
          <div>
            Parent <Outlet />
          </div>
        ),
      })
      const childRoute = createRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        gcTime: 0,
        context: () => {
          childContext()
          return { childMatched: true }
        },
        component: () => {
          const navigate = childRoute.useNavigate()
          return (
            <div>
              <span data-testid="child-page">Child</span>
              <button
                data-testid="go-parent-only"
                onClick={() => navigate({ to: '/parent' })}
              >
                go parent
              </button>
            </div>
          )
        },
      })
      const parentIndexRoute = createRoute({
        getParentRoute: () => parentRoute,
        path: '/',
        component: () => {
          const navigate = parentIndexRoute.useNavigate()
          return (
            <div>
              <span data-testid="parent-index-page">Parent Index</span>
              <button
                data-testid="go-child"
                onClick={() => navigate({ to: '/parent/child' })}
              >
                go child
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([
        parentRoute.addChildren([childRoute, parentIndexRoute]),
      ])
      const router = createRouter({ routeTree, history })

      await router.navigate({ to: '/parent/child' })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('child-page')
      expect(parentContext).toHaveBeenCalledTimes(1)
      expect(childContext).toHaveBeenCalledTimes(1)
      parentContext.mockClear()
      childContext.mockClear()

      fireEvent.click(await screen.findByTestId('go-parent-only'))
      await screen.findByTestId('parent-index-page')

      expect(parentContext).not.toHaveBeenCalled()

      fireEvent.click(await screen.findByTestId('go-child'))
      await screen.findByTestId('child-page')

      expect(parentContext).not.toHaveBeenCalled()

      expect(childContext).toHaveBeenCalledTimes(1)
    })
  })

  describe('context-with-invalidate-only routes (no loader)', () => {
    test('route with only context (invalidate) is GC-protected and works correctly', async () => {
      const mockContext = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => {
            mockContext()
            return { contextValue: 'from-context' }
          },
          invalidate: true,
        },
        component: () => {
          const navigate = indexRoute.useNavigate()
          const context = indexRoute.useRouteContext()
          return (
            <div>
              <span data-testid="context">{JSON.stringify(context())}</span>
              <button
                data-testid="go-other"
                onClick={() => navigate({ to: '/other' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        component: () => {
          const navigate = otherRoute.useNavigate()
          return (
            <div>
              <span data-testid="other-page">Other</span>
              <button
                data-testid="go-index"
                onClick={() => navigate({ to: '/' })}
              >
                go
              </button>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute, otherRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      expect(JSON.parse(contextEl.textContent)).toEqual(
        expect.objectContaining({ contextValue: 'from-context' }),
      )
      expect(mockContext).toHaveBeenCalledTimes(1)
      mockContext.mockClear()

      fireEvent.click(await screen.findByTestId('go-other'))
      await screen.findByTestId('other-page')

      fireEvent.click(await screen.findByTestId('go-index'))
      const contextEl2 = await screen.findByTestId('context')
      expect(JSON.parse(contextEl2.textContent)).toEqual(
        expect.objectContaining({ contextValue: 'from-context' }),
      )
      expect(mockContext).not.toHaveBeenCalled()
    })

    test('route with only context (invalidate) re-runs on invalidate', async () => {
      const mockContext = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => {
            mockContext()
            return { contextRun: mockContext.mock.calls.length }
          },
          invalidate: true,
        },
        component: () => <div data-testid="index-page">Index</div>,
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')
      expect(mockContext).toHaveBeenCalledTimes(1)
      mockContext.mockClear()

      await router.invalidate()

      expect(mockContext).toHaveBeenCalledTimes(1)
    })
  })

  describe('context updates on invalidation', () => {
    test('context from context with invalidate updates after each invalidation', async () => {
      let counter = 0

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => {
            counter++
            return { counter }
          },
          invalidate: true,
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await waitFor(() => {
        const el = screen.getByTestId('context')
        expect(JSON.parse(el.textContent).counter).toBe(1)
      })

      await router.invalidate()

      await waitFor(() => {
        const el = screen.getByTestId('context')
        expect(JSON.parse(el.textContent).counter).toBe(2)
      })

      await router.invalidate()

      await waitFor(() => {
        const el = screen.getByTestId('context')
        expect(JSON.parse(el.textContent).counter).toBe(3)
      })
    })
  })

  describe('context-only routes', () => {
    test('route with only context provides context to component', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => {
          return { onlyContext: 'value' }
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      expect(JSON.parse(contextEl.textContent)).toEqual(
        expect.objectContaining({ onlyContext: 'value' }),
      )
    })
  })

  describe('context overriding between lifecycle methods', () => {
    test('later lifecycle methods can override earlier context keys', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => {
          return { shared: 'from-context', contextOnly: 'ctx' }
        },
        beforeLoad: () => {
          return { shared: 'from-beforeLoad', beforeLoadOnly: 'bl' }
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      const context = JSON.parse(contextEl.textContent)

      expect(context.shared).toBe('from-beforeLoad')
      expect(context.contextOnly).toBe('ctx')
      expect(context.beforeLoadOnly).toBe('bl')
    })
  })

  describe('object form lifecycle methods', () => {
    test('object form beforeLoad handler runs and provides context', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        beforeLoad: {
          handler: () => ({ blValue: 'from-object-form' }),
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      expect(JSON.parse(contextEl.textContent)).toEqual(
        expect.objectContaining({ blValue: 'from-object-form' }),
      )
    })

    test('object form context handler runs and provides context', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => ({ omValue: 'from-object-form' }),
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      expect(JSON.parse(contextEl.textContent)).toEqual(
        expect.objectContaining({ omValue: 'from-object-form' }),
      )
    })

    test('object form context with invalidate handler runs and provides context', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => ({ ctxValue: 'from-object-form' }),
          invalidate: true,
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      expect(JSON.parse(contextEl.textContent)).toEqual(
        expect.objectContaining({ ctxValue: 'from-object-form' }),
      )
    })

    test('object form loader handler runs and provides loaderData', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader: {
          handler: () => ({ ldValue: 'from-object-form' }),
        },
        component: () => {
          const data = indexRoute.useLoaderData()
          return <div data-testid="loader-data">{JSON.stringify(data())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const dataEl = await screen.findByTestId('loader-data')
      expect(JSON.parse(dataEl.textContent)).toEqual({
        ldValue: 'from-object-form',
      })
    })

    test('mixed function and object form on the same route', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => ({ ctxFunc: 'function-form' }),
        beforeLoad: {
          handler: () => ({ blObj: 'object-form' }),
        },
        loader: () => ({ ldFunc: 'function-form' }),
        component: () => {
          const context = indexRoute.useRouteContext()
          const data = indexRoute.useLoaderData()
          return (
            <div>
              <span data-testid="context">{JSON.stringify(context())}</span>
              <span data-testid="loader-data">{JSON.stringify(data())}</span>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      const context = JSON.parse(contextEl.textContent)
      expect(context).toEqual(
        expect.objectContaining({
          ctxFunc: 'function-form',
          blObj: 'object-form',
        }),
      )

      const dataEl = screen.getByTestId('loader-data')
      expect(JSON.parse(dataEl.textContent)).toEqual({
        ldFunc: 'function-form',
      })
    })

    test('object form with serialize flag still runs handler on client navigation', async () => {
      const contextHandler = vi.fn(() => ({ ctxVal: 'matched' }))

      const rootRoute = createRootRoute({
        component: () => (
          <div>
            <Outlet />
          </div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          const navigate = indexRoute.useNavigate()
          return (
            <div>
              <span data-testid="index-page">Index</span>
              <button
                data-testid="go-about"
                onClick={() => navigate({ to: '/about' })}
              >
                go
              </button>
            </div>
          )
        },
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        context: {
          handler: contextHandler,
          serialize: true,
        },
        component: () => {
          const context = aboutRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)
      await screen.findByTestId('index-page')

      fireEvent.click(screen.getByTestId('go-about'))
      const contextEl = await screen.findByTestId('context')
      expect(JSON.parse(contextEl.textContent)).toEqual(
        expect.objectContaining({ ctxVal: 'matched' }),
      )
      expect(contextHandler).toHaveBeenCalledTimes(1)
    })

    test('object form backward compat: function form still works identically', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: () => ({ ctxFn: 'fn' }),
        beforeLoad: () => ({ blFn: 'fn' }),
        loader: () => ({ ldFn: 'fn' }),
        component: () => {
          const context = indexRoute.useRouteContext()
          const data = indexRoute.useLoaderData()
          return (
            <div>
              <span data-testid="context">{JSON.stringify(context())}</span>
              <span data-testid="loader-data">{JSON.stringify(data())}</span>
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      const context = JSON.parse(contextEl.textContent)
      expect(context).toEqual(
        expect.objectContaining({
          ctxFn: 'fn',
          blFn: 'fn',
        }),
      )

      const dataEl = screen.getByTestId('loader-data')
      expect(JSON.parse(dataEl.textContent)).toEqual({ ldFn: 'fn' })
    })

    test('object form context chain flows correctly parent to child', async () => {
      const rootRoute = createRootRoute({
        component: () => (
          <div>
            <Outlet />
          </div>
        ),
      })
      const parentRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: {
          handler: () => ({ parentOM: 'p-om' }),
        },
        beforeLoad: {
          handler: () => ({ parentBL: 'p-bl' }),
          serialize: false,
        },
        component: () => (
          <div>
            <Outlet />
          </div>
        ),
      })
      const childRoute = createRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        context: {
          handler: ({ context }) => ({
            childCtx: 'c-ctx',
            sawParentOM: context.parentOM,
            sawParentBL: context.parentBL,
          }),
        },
        component: () => {
          const context = childRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
      ])
      const router = createRouter({ routeTree, history })

      await router.navigate({ to: '/parent/child' })

      render(() => <RouterProvider router={router} />)

      const contextEl = await screen.findByTestId('context')
      const context = JSON.parse(contextEl.textContent)
      expect(context).toEqual(
        expect.objectContaining({
          parentOM: 'p-om',
          parentBL: 'p-bl',
          childCtx: 'c-ctx',
          sawParentOM: 'p-om',
          sawParentBL: 'p-bl',
        }),
      )
    })

    test('object form context runs only once even with serialize flag', async () => {
      const contextCount = vi.fn()

      const rootRoute = createRootRoute({
        component: () => (
          <div>
            <Outlet />
          </div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => {
            contextCount()
            return { matched: true }
          },
          serialize: true,
        },
        component: () => {
          const context = indexRoute.useRouteContext()
          return <div data-testid="context">{JSON.stringify(context())}</div>
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('context')
      expect(contextCount).toHaveBeenCalledTimes(1)

      // Invalidate and verify context doesn't re-run
      await router.invalidate()

      expect(contextCount).toHaveBeenCalledTimes(1)
    })

    test('object form context with invalidate re-runs on invalidation', async () => {
      const contextCount = vi.fn()

      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        context: {
          handler: () => {
            contextCount()
            return { runCount: contextCount.mock.calls.length }
          },
          invalidate: true,
        },
        component: () => <div data-testid="index-page">Index</div>,
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const router = createRouter({ routeTree, history })

      render(() => <RouterProvider router={router} />)

      await screen.findByTestId('index-page')
      expect(contextCount).toHaveBeenCalledTimes(1)

      await router.invalidate()

      // context with invalidate should re-run on invalidation
      expect(contextCount).toHaveBeenCalledTimes(2)
    })
  })
})
