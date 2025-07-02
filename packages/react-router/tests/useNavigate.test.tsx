import React, { act } from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import { z } from 'zod'
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  getRouteApi,
  useNavigate,
  useParams,
} from '../src'
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

test('when navigating to /posts', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/' })}>Index</button>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: () => {
      return (
        <>
          <h1>Posts</h1>
        </>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history,
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', { name: 'Posts' })

  fireEvent.click(postsButton)

  expect(
    await screen.findByRole('heading', { name: 'Posts' }),
  ).toBeInTheDocument()

  expect(window.location.pathname).toBe('/posts')
})

test('when navigating from /posts to ./$postId', async () => {
  const rootRoute = createRootRoute()
  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({ to: '/posts/$postId', params: { postId: 'id1' } })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostsIndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Posts Index</h1>
        <button
          onClick={() =>
            navigate({
              from: '/posts/',
              to: './$postId',
              params: { postId: 'id1' },
            })
          }
        >
          To the first post
        </button>
      </>
    )
  }

  const postsIndexRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '/',
    component: PostsIndexComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    const navigate = useNavigate()
    return (
      <>
        <span>Params: {params.postId}</span>
        <button onClick={() => navigate({ to: '/' })}>Index</button>
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      postsRoute.addChildren([postsIndexRoute, postRoute]),
    ]),
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', { name: 'Posts' })

  fireEvent.click(postsButton)

  expect(await screen.findByText('Posts Index')).toBeInTheDocument()

  const postButton = await screen.findByRole('button', {
    name: 'To the first post',
  })

  fireEvent.click(postButton)

  expect(await screen.findByText('Params: id1')).toBeInTheDocument()

  expect(window.location.pathname).toBe('/posts/id1')
})

test('when navigating from /posts to ../posts/$postId', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({ to: '/posts/$postId', params: { postId: 'id1' } })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostsIndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Posts Index</h1>
        <button
          onClick={() =>
            navigate({
              from: '/posts/',
              to: '../posts/$postId',
              params: { postId: 'id1' },
            })
          }
        >
          To the first post
        </button>
      </>
    )
  }

  const postsIndexRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '/',
    component: PostsIndexComponent,
  })

  const PostComponent = () => {
    const navigate = useNavigate()
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <button onClick={() => navigate({ to: '/' })}>Index</button>
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      postsRoute.addChildren([postsIndexRoute, postRoute]),
    ]),
    history,
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', { name: 'Posts' })

  fireEvent.click(postsButton)

  expect(await screen.findByText('Posts Index')).toBeInTheDocument()

  const postButton = await screen.findByRole('button', {
    name: 'To the first post',
  })

  fireEvent.click(postButton)

  expect(await screen.findByText('Params: id1')).toBeInTheDocument()
})

test('when navigating from /posts/$postId to /posts/$postId/info and the current route is /posts/$postId/details', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({
              to: '/posts/$postId/details',
              params: { postId: 'id1' },
            })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_layout',
    component: () => {
      return (
        <>
          <h1>Layout</h1>
          <Outlet />
        </>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <Outlet />
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const DetailsComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Details!</h1>
        <button
          onClick={() =>
            navigate({ from: '/posts/$postId', to: '/posts/$postId/info' })
          }
        >
          To Information
        </button>
      </>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <>
        <h1>Information</h1>
      </>
    )
  }

  const informationRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'info',
    component: InformationComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      layoutRoute.addChildren([
        postsRoute.addChildren([
          postRoute.addChildren([detailsRoute, informationRoute]),
        ]),
      ]),
    ]),
    history,
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postsButton)

  expect(await screen.findByText('Params: id1')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1/details')

  const informationButton = await screen.findByRole('button', {
    name: 'To Information',
  })

  fireEvent.click(informationButton)

  expect(await screen.findByText('Information')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1/info')

  expect(await screen.findByText('Params: id1'))
})

test('when navigating from /posts/$postId to ./info and the current route is /posts/$postId/details', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({
              to: '/posts/$postId/details',
              params: { postId: 'id1' },
            })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_layout',
    component: () => {
      return (
        <>
          <h1>Layout</h1>
          <Outlet />
        </>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <Outlet />
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const DetailsComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Details!</h1>
        <button
          onClick={() => navigate({ from: '/posts/$postId', to: './info' })}
        >
          To Information
        </button>
      </>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <>
        <h1>Information</h1>
      </>
    )
  }

  const informationRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'info',
    component: InformationComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      layoutRoute.addChildren([
        postsRoute.addChildren([
          postRoute.addChildren([detailsRoute, informationRoute]),
        ]),
      ]),
    ]),
    history,
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postsButton)

  expect(await screen.findByText('Params: id1')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1/details')

  const informationButton = await screen.findByRole('button', {
    name: 'To Information',
  })

  fireEvent.click(informationButton)

  expect(await screen.findByText('Information')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1/info')

  expect(await screen.findByText('Params: id1'))
})

test('when navigating from /posts/$postId to ../$postId and the current route is /posts/$postId/details', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({
              to: '/posts/$postId/details',
              params: { postId: 'id1' },
            })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_layout',
    component: () => {
      return (
        <>
          <h1>Layout</h1>
          <Outlet />
        </>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <Outlet />
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const DetailsComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Details!</h1>
        <button
          onClick={() => navigate({ from: '/posts/$postId', to: '../$postId' })}
        >
          To Post
        </button>
      </>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <>
        <h1>Information</h1>
      </>
    )
  }

  const informationRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'info',
    component: InformationComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      layoutRoute.addChildren([
        postsRoute.addChildren([
          postRoute.addChildren([detailsRoute, informationRoute]),
        ]),
      ]),
    ]),
    history,
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postsButton)

  expect(await screen.findByText('Params: id1')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1/details')

  const postButton = await screen.findByRole('button', {
    name: 'To Post',
  })

  fireEvent.click(postButton)

  expect(await screen.findByText('Posts')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1')
})

test('when navigating from /posts/$postId with an index to ../$postId and the current route is /posts/$postId/details', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({
              to: '/posts/$postId/details',
              params: { postId: 'id1' },
            })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_layout',
    component: () => {
      return (
        <>
          <h1>Layout</h1>
          <Outlet />
        </>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <Outlet />
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const postIndexRoute = createRoute({
    getParentRoute: () => postRoute,
    path: '/',
    component: () => <h1>Post Index</h1>,
  })

  const DetailsComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Details!</h1>
        <button
          onClick={() => navigate({ from: '/posts/$postId', to: '../$postId' })}
        >
          To Post
        </button>
      </>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <>
        <h1>Information</h1>
      </>
    )
  }

  const informationRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'info',
    component: InformationComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      layoutRoute.addChildren([
        postsRoute.addChildren([
          postRoute.addChildren([
            postIndexRoute,
            detailsRoute,
            informationRoute,
          ]),
        ]),
      ]),
    ]),
    history,
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postsButton)

  expect(await screen.findByText('Params: id1')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1/details')

  const postButton = await screen.findByRole('button', {
    name: 'To Post',
  })

  fireEvent.click(postButton)

  expect(await screen.findByText('Posts')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1')
})

test('when navigating from /invoices to ./invoiceId and the current route is /posts/$postId/details', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({
              to: '/posts/$postId/details',
              params: { postId: 'id1' },
            })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_layout',
    component: () => {
      return (
        <>
          <h1>Layout</h1>
          <Outlet />
        </>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <Outlet />
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const DetailsComponent = () => {
    const navigate = useNavigate()
    const [error, setError] = React.useState<unknown>()
    return (
      <>
        <h1>Details!</h1>
        <button
          onClick={() => {
            try {
              navigate({
                from: '/invoices',
                to: './$invoiceId',
                params: { invoiceId: 'id1' },
              })
            } catch (e) {
              setError(e)
            }
          }}
        >
          To Invoices
        </button>
        <span>Something went wrong!</span>
      </>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <>
        <h1>Information</h1>
      </>
    )
  }

  const informationRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'info',
    component: InformationComponent,
  })

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    component: () => (
      <>
        <h1>Invoices!</h1>
        <Outlet />
      </>
    ),
  })

  const InvoiceComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>invoiceId: {params.invoiceId}</span>
      </>
    )
  }

  const invoiceRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '$invoiceId',
    component: InvoiceComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      layoutRoute.addChildren([
        invoicesRoute.addChildren([invoiceRoute]),
        postsRoute.addChildren([
          postRoute.addChildren([detailsRoute, informationRoute]),
        ]),
      ]),
    ]),
    history,
  })

  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postsButton)

  const invoicesButton = await screen.findByRole('button', {
    name: 'To Invoices',
  })

  fireEvent.click(invoicesButton)

  expect(consoleWarn).toHaveBeenCalledWith(
    'Could not find match for from: /invoices',
  )

  consoleWarn.mockRestore()
})

test('when navigating to /posts/$postId/info which is masked as /posts/$postId', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button
          onClick={() =>
            navigate({ to: '/posts/$postId/info', params: { postId: 'id1' } })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <Outlet />
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const InformationComponent = () => {
    return (
      <>
        <h1>Information</h1>
      </>
    )
  }

  const informationRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'info',
    component: InformationComponent,
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postRoute.addChildren([informationRoute])]),
  ])

  const routeMask = createRouteMask({
    routeTree,
    from: '/posts/$postId/info',
    to: '/posts',
  })

  const router = createRouter({
    routeTree,
    routeMasks: [routeMask],
    history,
  })

  render(<RouterProvider router={router} />)

  const postButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postButton)

  expect(await screen.findByText('Params: id1'))
})

test('when navigating to /posts/$postId/info which is imperatively masked as /posts/$postId', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <>
        <h1>Index</h1>
        <button
          onClick={() =>
            navigate({
              to: '/posts/$postId/info',
              params: { postId: 'id1' },
              mask: { to: '/posts/$postId', params: { postId: 'id1' } },
            })
          }
        >
          To first post
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <>
        <h1>Posts</h1>
        <Outlet />
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const PostComponent = () => {
    const params = useParams({ strict: false })
    return (
      <>
        <span>Params: {params.postId}</span>
        <Outlet />
      </>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const InformationComponent = () => {
    return (
      <>
        <h1>Information</h1>
      </>
    )
  }

  const informationRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'info',
    component: InformationComponent,
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postRoute.addChildren([informationRoute])]),
  ])

  const router = createRouter({
    routeTree,
    history,
  })

  render(<RouterProvider router={router} />)

  const postButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postButton)

  expect(await screen.findByText('Information')).toBeInTheDocument()

  expect(window.location.pathname).toEqual('/posts/id1')
})

test('when setting search params with 2 parallel navigate calls', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    const search = indexRoute.useSearch()
    return (
      <>
        <h1>Index</h1>
        <div data-testid="param1">{search.param1}</div>
        <div data-testid="param2">{search.param2}</div>
        <button
          onClick={() => {
            navigate({
              to: '/',
              search: (prev: any) => ({ ...prev, param1: 'foo' }),
            })

            navigate({
              to: '/',
              search: (prev: any) => ({ ...prev, param2: 'bar' }),
            })
          }}
        >
          search
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
    validateSearch: z.object({
      param1: z.string().default('param1-default'),
      param2: z.string().default('param2-default'),
    }),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history,
  })

  render(<RouterProvider router={router} />)
  expect(router.state.location.search).toEqual({
    param1: 'param1-default',
    param2: 'param2-default',
  })

  const postsButton = await screen.findByRole('button', { name: 'search' })

  fireEvent.click(postsButton)

  expect(await screen.findByTestId('param1')).toHaveTextContent('foo')
  expect(await screen.findByTestId('param2')).toHaveTextContent('bar')
  expect(router.state.location.search).toEqual({ param1: 'foo', param2: 'bar' })
  const search = new URLSearchParams(window.location.search)
  expect(search.get('param1')).toEqual('foo')
  expect(search.get('param2')).toEqual('bar')
})

test('<Navigate> navigates only once in <StrictMode>', async () => {
  configure({ reactStrictMode: true })
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Navigate to="/posts" />,
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: () => {
      return (
        <>
          <h1 data-testid="posts-title">Posts</h1>
        </>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history,
  })

  const navigateSpy = vi.spyOn(router, 'navigate')

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('posts-title')).toBeInTheDocument()
  expect(navigateSpy.mock.calls.length).toBe(1)
})

test('should navigate to current route with search params when using "." in nested route structure', async () => {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      const navigate = useNavigate()
      return (
        <>
          <button
            onClick={() => {
              navigate({
                to: '/post',
              })
            }}
          >
            Post
          </button>
          <button
            onClick={() =>
              navigate({
                to: '.',
                search: {
                  param1: 'value1',
                },
              })
            }
          >
            Open
          </button>
          <Outlet />
        </>
      )
    },
    validateSearch: z.object({
      param1: z.string().optional(),
    }),
  })

  const postRoute = createRoute({
    getParentRoute: () => indexRoute,
    path: 'post',
    component: () => <div>Post</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute.addChildren([postRoute])]),
    history,
  })

  render(<RouterProvider router={router} />)

  const postButton = await screen.findByRole('button', { name: 'Post' })
  act(() => {
    fireEvent.click(postButton)
  })

  expect(router.state.location.pathname).toBe('/post')

  const openButton = await screen.findByRole('button', { name: 'Open' })

  console.log('click')
  await act(async () => {
    fireEvent.click(openButton)
  })

  expect(router.state.location.pathname).toBe('/post')
  expect(router.state.location.search).toEqual({ param1: 'value1' })
})

describe('when on /posts/$postId and navigating to ../ with default `from` /posts', () => {
  async function runTest(navigateVia: 'Route' | 'RouteApi') {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()
      return (
        <>
          <h1 data-testid="index-heading">Index</h1>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
          <button
            data-testid="index-to-first-post-btn"
            onClick={() =>
              navigate({
                to: '/posts/$postId/details',
                params: { postId: 'id1' },
              })
            }
          >
            To first post
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      const routeNavigate = postsRoute.useNavigate()
      const routeApiNavigate = getRouteApi('/_layout/posts').useNavigate()
      return (
        <>
          <h1>Posts</h1>
          <button
            data-testid="btn-to-home"
            onClick={() => {
              if (navigateVia === 'Route') {
                routeNavigate({ to: '../' })
              } else {
                routeApiNavigate({ to: '../' })
              }
            }}
          >
            To Home
          </button>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const PostIndexComponent = () => {
      return (
        <>
          <h1>Post Index</h1>
        </>
      )
    }

    const postIndexRoute = createRoute({
      getParentRoute: () => postRoute,
      path: '/',
      component: PostIndexComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1 data-testid="details-heading">Details!</h1>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([
            postRoute.addChildren([postIndexRoute, detailsRoute]),
          ]),
        ]),
      ]),
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByTestId('index-to-first-post-btn')

    fireEvent.click(postsButton)

    expect(await screen.findByTestId('details-heading')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const homeButton = await screen.findByTestId('btn-to-home')

    fireEvent.click(homeButton)

    expect(await screen.findByTestId('index-heading')).toBeInTheDocument()
    expect(window.location.pathname).toEqual('/')
  }

  test('Route', () => runTest('Route'))
  test('RouteApi', () => runTest('RouteApi'))
})

describe.each([{ basepath: '' }, { basepath: '/basepath' }])(
  'relative useNavigate with %s',
  ({ basepath }) => {
    const setupRouter = () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          return <h1>Index Route</h1>
        },
      })
      const aRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'a',
        component: () => {
          return (
            <>
              <h1>A Route</h1>
              <Outlet />
            </>
          )
        },
      })

      const bRoute = createRoute({
        getParentRoute: () => aRoute,
        path: 'b',
        component: function BRoute() {
          const navigate = useNavigate()
          return (
            <>
              <h1>B Route</h1>
              <button onClick={() => navigate({ to: '..' })}>
                Link to Parent
              </button>
            </>
          )
        },
      })

      const paramRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'param/$param',
        component: function ParamRoute() {
          const navigate = useNavigate()
          return (
            <>
              <h1>Param Route</h1>
              <button onClick={() => navigate({ to: './a' })}>
                Link to ./a
              </button>
              <button
                onClick={() => navigate({ params: { param: 'bar' } as any })}
              >
                Link to . with param:bar
              </button>
              <Outlet />
            </>
          )
        },
      })

      const paramARoute = createRoute({
        getParentRoute: () => paramRoute,
        path: 'a',
        component: function ParamARoute() {
          const navigate = useNavigate()
          return (
            <>
              <h1>Param A Route</h1>
              <button onClick={() => navigate({ to: '..' })}>
                Link to .. from /param/foo/a
              </button>
              <Outlet />
            </>
          )
        },
      })

      const paramBRoute = createRoute({
        getParentRoute: () => paramARoute,
        path: 'b',
        component: function ParamBRoute() {
          const navigate = useNavigate()
          return (
            <>
              <h1>Param B Route</h1>
              <button onClick={() => navigate({ to: '..' })}>
                Link to Parent
              </button>
              <button
                onClick={() => navigate({ to: '..', params: { param: 'bar' } })}
              >
                Link to Parent with param:bar
              </button>
              <button
                onClick={() => navigate({ to: '..', params: { param: 'bar' } })}
              >
                Link to Parent with param:bar functional
              </button>
            </>
          )
        },
      })

      return createRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          aRoute.addChildren([bRoute]),
          paramRoute.addChildren([paramARoute, paramBRoute]),
        ]),
        history,
        basepath: basepath === '' ? undefined : basepath,
      })
    }

    test('should navigate to the parent route', async () => {
      const router = setupRouter()

      render(<RouterProvider router={router} />)

      // Navigate to /a/b
      await act(async () => {
        history.push(`${basepath}/a/b`)
      })

      // Inspect the link to go up a parent
      const parentLink = await screen.findByText('Link to Parent')

      // Click the link and ensure the new location
      await act(async () => {
        fireEvent.click(parentLink)
      })

      expect(window.location.pathname).toBe(`${basepath}/a`)
    })

    test('should navigate to the parent route and keep params', async () => {
      const router = setupRouter()

      render(<RouterProvider router={router} />)

      // Navigate to /param/oldParamValue/a/b
      await act(async () => {
        history.push(`${basepath}/param/foo/a/b`)
      })

      // Inspect the link to go up a parent and keep the params
      const parentLink = await screen.findByText('Link to Parent')

      // Click the link and ensure the new location
      await act(async () => {
        fireEvent.click(parentLink)
      })

      expect(window.location.pathname).toBe(`${basepath}/param/foo/a`)
    })

    test('should navigate to the parent route and change params', async () => {
      const router = setupRouter()

      render(<RouterProvider router={router} />)

      // Navigate to /param/oldParamValue/a/b
      await act(async () => {
        history.push(`${basepath}/param/foo/a/b`)
      })

      // Inspect the link to go up a parent and keep the params
      const parentLink = await screen.findByText(
        'Link to Parent with param:bar',
      )

      // Click the link and ensure the new location
      await act(async () => {
        fireEvent.click(parentLink)
      })

      expect(window.location.pathname).toBe(`${basepath}/param/bar/a`)
    })

    test('should navigate to a relative link based on render location with basepath', async () => {
      const router = setupRouter()

      render(<RouterProvider router={router} />)

      await act(async () => {
        history.push(`${basepath}/param/foo/a/b`)
      })

      // Inspect the relative link to ./a
      const relativeLink = await screen.findByText('Link to ./a')

      // Click the link and ensure the new location
      await act(async () => {
        fireEvent.click(relativeLink)
      })

      expect(window.location.pathname).toBe(`${basepath}/param/foo/a`)
    })

    test('should navigate to a parent link based on render location', async () => {
      const router = setupRouter()

      render(<RouterProvider router={router} />)

      await act(async () => {
        history.push(`${basepath}/param/foo/a/b`)
      })

      // Inspect the relative link to ./a
      const relativeLink = await screen.findByText(
        'Link to .. from /param/foo/a',
      )

      // Click the link and ensure the new location
      await act(async () => {
        fireEvent.click(relativeLink)
      })

      expect(window.location.pathname).toBe(`${basepath}/param/foo`)
    })

    test('should navigate to same route with different params', async () => {
      const router = setupRouter()

      render(<RouterProvider router={router} />)

      await act(async () => {
        history.push(`${basepath}/param/foo/a/b`)
      })

      const parentLink = await screen.findByText('Link to . with param:bar')

      await act(async () => {
        fireEvent.click(parentLink)
      })

      expect(window.location.pathname).toBe(`${basepath}/param/bar/a/b`)
    })
  },
)
