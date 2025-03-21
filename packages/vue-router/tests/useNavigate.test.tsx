/** @jsxImportSource vue */

import * as Vue from 'vue'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'

import { z } from 'zod'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  getRouteApi,
  useNavigate,
  useParams,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

test('when navigating to /posts', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <template>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/' })}>Index</button>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
      </template>
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
        <template>
          <h1>Posts</h1>
        </template>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
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
      <template>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({ to: '/posts/$postId', params: { postId: 'id1' } })
          }
        >
          To first post
        </button>
      </template>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
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
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <button onClick={() => navigate({ to: '/' })}>Index</button>
      </template>
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
      <template>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button
          onClick={() =>
            navigate({ to: '/posts/$postId', params: { postId: 'id1' } })
          }
        >
          To first post
        </button>
      </template>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
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
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <button onClick={() => navigate({ to: '/' })}>Index</button>
      </template>
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
})

test('when navigating from /posts/$postId to /posts/$postId/info and the current route is /posts/$postId/details', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <template>
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
      </template>
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
        <template>
          <h1>Layout</h1>
          <Outlet />
        </template>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <Outlet />
      </template>
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
      <template>
        <h1>Details!</h1>
        <button
          onClick={() =>
            navigate({ from: '/posts/$postId', to: '/posts/$postId/info' })
          }
        >
          To Information
        </button>
      </template>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <template>
        <h1>Information</h1>
      </template>
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
      <template>
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
      </template>
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
        <template>
          <h1>Layout</h1>
          <Outlet />
        </template>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <Outlet />
      </template>
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
      <template>
        <h1>Details!</h1>
        <button
          onClick={() => navigate({ from: '/posts/$postId', to: './info' })}
        >
          To Information
        </button>
      </template>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <template>
        <h1>Information</h1>
      </template>
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
      <template>
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
      </template>
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
        <template>
          <h1>Layout</h1>
          <Outlet />
        </template>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <Outlet />
      </template>
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
      <template>
        <h1>Details!</h1>
        <button
          onClick={() => navigate({ from: '/posts/$postId', to: '../$postId' })}
        >
          To Post
        </button>
      </template>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <template>
        <h1>Information</h1>
      </template>
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
      <template>
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
      </template>
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
        <template>
          <h1>Layout</h1>
          <Outlet />
        </template>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <Outlet />
      </template>
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
      <template>
        <h1>Details!</h1>
        <button
          onClick={() => navigate({ from: '/posts/$postId', to: '../$postId' })}
        >
          To Post
        </button>
      </template>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <template>
        <h1>Information</h1>
      </template>
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
      <template>
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
      </template>
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
        <template>
          <h1>Layout</h1>
          <Outlet />
        </template>
      )
    },
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <Outlet />
      </template>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const DetailsComponent = () => {
    const navigate = useNavigate()
    const error = Vue.ref<unknown>(null)

    return (
      <template>
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
              error.value = e
            }
          }}
        >
          To Invoices
        </button>
        <span>Something went wrong!</span>
      </template>
    )
  }

  const detailsRoute = createRoute({
    getParentRoute: () => postRoute,
    path: 'details',
    component: DetailsComponent,
  })

  const InformationComponent = () => {
    return (
      <template>
        <h1>Information</h1>
      </template>
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
      <template>
        <h1>Invoices!</h1>
        <Outlet />
      </template>
    ),
  })

  const InvoiceComponent = () => {
    const params = useParams({ strict: false })
    return (
      <template>
        <span>invoiceId: {params.value.invoiceId}</span>
      </template>
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
  })

  render(<RouterProvider router={router} />)

  const postsButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postsButton)

  const invoicesButton = await screen.findByRole('button', {
    name: 'To Invoices',
  })

  fireEvent.click(invoicesButton)

  expect(await screen.findByText('Something went wrong!')).toBeInTheDocument()
})

test('when navigating to /posts/$postId/info which is masked as /posts/$postId', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <template>
        <h1>Index</h1>
        <button
          onClick={() =>
            navigate({ to: '/posts/$postId/info', params: { postId: 'id1' } })
          }
        >
          To first post
        </button>
      </template>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <Outlet />
      </template>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const InformationComponent = () => {
    return (
      <template>
        <h1>Information</h1>
      </template>
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
  })

  render(<RouterProvider router={router} />)

  const postButton = await screen.findByRole('button', {
    name: 'To first post',
  })

  fireEvent.click(postButton)

  await new Promise((r) => setTimeout(r, 0))

  expect(await screen.findByText('Params: id1'))
})

test('when navigating to /posts/$postId/info which is imperatively masked as /posts/$postId', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()
    return (
      <template>
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
      </template>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const PostsComponent = () => {
    return (
      <template>
        <h1>Posts</h1>
        <Outlet />
      </template>
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
      <template>
        <span>Params: {params.value.postId}</span>
        <Outlet />
      </template>
    )
  }

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  const InformationComponent = () => {
    return (
      <template>
        <h1>Information</h1>
      </template>
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
      <template>
        <h1>Index</h1>
        <div data-testid="param1">{search.value.param1}</div>
        <div data-testid="param2">{search.value.param2}</div>
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
      </template>
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

  // console.log(indexRoute.options.validateSearch)
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
  })

  render(<RouterProvider router={router} />)

  // console.log(router.state.location)
  expect(router.state.location.search).toEqual({
    param1: 'param1-default',
    param2: 'param2-default',
  })

  const postsButton = await screen.findByRole('button', { name: 'search' })

  fireEvent.click(postsButton)

  await new Promise((r) => setTimeout(r, 0))

  expect(await screen.findByTestId('param1')).toHaveTextContent('foo')
  expect(await screen.findByTestId('param2')).toHaveTextContent('bar')
  expect(router.state.location.search).toEqual({ param1: 'foo', param2: 'bar' })
  const search = new URLSearchParams(window.location.search)
  expect(search.get('param1')).toEqual('foo')
  expect(search.get('param2')).toEqual('bar')
})

describe('when on /posts/$postId and navigating to ../ with default `from` /posts', () => {
  async function runTest(navigateVia: 'Route' | 'RouteApi') {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()
      return (
        <template>
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
        </template>
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
          <template>
            <h1>Layout</h1>
            <Outlet />
          </template>
        )
      },
    })

    const PostsComponent = () => {
      const routeNavigate = postsRoute.useNavigate()
      const routeApiNavigate = getRouteApi('/_layout/posts').useNavigate()
      return (
        <template>
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
        </template>
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
        <template>
          <span>Params: {params.value.postId}</span>
          <Outlet />
        </template>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const PostIndexComponent = () => {
      return (
        <template>
          <h1>Post Index</h1>
        </template>
      )
    }

    const postIndexRoute = createRoute({
      getParentRoute: () => postRoute,
      path: '/',
      component: PostIndexComponent,
    })

    const DetailsComponent = () => {
      return (
        <template>
          <h1 data-testid="details-heading">Details!</h1>
        </template>
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
