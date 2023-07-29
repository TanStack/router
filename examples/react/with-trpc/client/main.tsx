import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Router,
  Link,
  MatchRoute,
  useSearch,
  useNavigate,
  RootRoute,
  Route,
  useParams,
  useRouter,
  RouterContext,
} from '@tanstack/router'
import {
  createLoaderOptions,
  Loader,
  LoaderClient,
  LoaderClientProvider,
  typedClient,
  useLoaderClient,
  useLoaderInstance,
} from '@tanstack/react-loaders'
import { AppRouter } from '../server/server'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'

import { z } from 'zod'

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000',
    }),
  ],
})

const postsLoader = new Loader({
  key: 'posts',
  fn: () => trpc.posts.query(),
})

const postLoader = new Loader({
  key: 'post',
  fn: (postId: number) => trpc.post.query(postId),
  onInvalidate: ({ client }) => {
    // Invalidate the posts loader when a post is invalidated
    typedClient(client).invalidateLoader({ key: 'posts' })
  },
})

const loaderClient = new LoaderClient({
  loaders: [postsLoader, postLoader],
})

declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}

function Spinner() {
  return <div className="inline-block animate-spin px-3">⍥</div>
}

const routerContext = new RouterContext<{
  loaderClient: typeof loaderClient
}>()

const rootRoute = routerContext.createRootRoute({
  component: () => {
    const {
      state: { status },
    } = useRouter()

    const {
      state: { isLoading },
    } = useLoaderClient()

    return (
      <>
        <div className={`min-h-screen flex flex-col`}>
          <div className={`flex items-center border-b gap-2`}>
            <h1 className={`text-3xl p-2`}>Kitchen Sink</h1>
            {/* Show a global spinner when the router is transitioning */}
            <div
              className={`text-3xl duration-300 delay-0 opacity-0 ${
                status === 'pending' || isLoading
                  ? ` duration-1000 opacity-40`
                  : ''
              }`}
            >
              <Spinner />
            </div>
          </div>
          <div className={`flex-1 flex`}>
            <div className={`divide-y w-56`}>
              {(
                [
                  ['/', 'Home'],
                  ['/dashboard', 'Dashboard'],
                ] as const
              ).map(([to, label]) => {
                return (
                  <div key={to}>
                    <Link
                      to={to}
                      activeOptions={
                        {
                          // If the route points to the root of it's parent,
                          // make sure it's only active if it's exact
                          // exact: to === '.',
                        }
                      }
                      preload="intent"
                      className={`block py-2 px-3 text-blue-700`}
                      // Make "active" links bold
                      activeProps={{ className: `font-bold` }}
                    >
                      {label}
                    </Link>
                  </div>
                )
              })}
            </div>
            <div className={`flex-1 border-l border-gray-200`}>
              {/* Render our first route match */}
              <Outlet />
            </div>
          </div>
        </div>
        <TanStackRouterDevtools position="bottom-right" />
      </>
    )
  },
})

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return (
      <div className={`p-2`}>
        <div className={`text-lg`}>Welcome Home!</div>
        <hr className={`my-2`} />
        <Link
          to={postRoute.fullPath}
          params={{
            postId: 3,
          }}
          className={`py-1 px-2 text-xs bg-blue-500 text-white rounded-full`}
        >
          1 New Invoice
        </Link>
        <hr className={`my-2`} />
        <div className={`max-w-xl`}>
          As you navigate around take note of the UX. It should feel
          suspense-like, where routes are only rendered once all of their data
          and elements are ready.
          <hr className={`my-2`} />
          To exaggerate async effects, play with the artificial request delay
          slider in the bottom-left corner.
          <hr className={`my-2`} />
          The last 2 sliders determine if link-hover preloading is enabled (and
          how long those preloads stick around) and also whether to cache
          rendered route data (and for how long). Both of these default to 0 (or
          off).
        </div>
      </div>
    )
  },
})

const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
  loader: async ({ preload, context: { loaderClient } }) => {
    await loaderClient.load({ key: 'posts', preload })
  },
  component: () => {
    return (
      <>
        <div className="flex items-center border-b">
          <h2 className="text-xl p-2">Dashboard</h2>
          <Link
            to="/dashboard/posts/$postId"
            params={{
              postId: 3,
            }}
            className="py-1 px-2 text-xs bg-blue-500 text-white rounded-full"
          >
            1 New Invoice
          </Link>
        </div>
        <div className="flex flex-wrap divide-x">
          {(
            [
              ['.', 'Summary'],
              ['/dashboard/posts', 'Posts'],
            ] as const
          ).map(([to, label]) => {
            return (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === '.' }}
                activeProps={{ className: `font-bold` }}
                className="p-2"
              >
                {label}
              </Link>
            )
          })}
        </div>
        <hr />
        <Outlet />
      </>
    )
  },
})

const dashboardIndexRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: () => {
    const { data: posts } = useLoaderInstance({ key: 'posts' })

    return (
      <div className="p-2">
        <div className="p-2">
          Welcome to the dashboard! You have{' '}
          <strong>{posts.length} total posts</strong>.
        </div>
      </div>
    )
  },
})

const postsRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: 'posts',
  component: () => {
    const { data: posts } = useLoaderInstance({ key: 'posts' })

    return (
      <div className="flex-1 flex">
        <div className="divide-y w-48">
          {posts?.map((post) => {
            return (
              <div key={post.id}>
                <Link
                  to={postRoute.fullPath}
                  params={{
                    postId: post.id,
                  }}
                  preload="intent"
                  className="block py-2 px-3 text-blue-700"
                  activeProps={{ className: `font-bold` }}
                >
                  <pre className="text-sm">
                    #{post.id} - {post.title.slice(0, 10)}{' '}
                    <MatchRoute
                      to={postRoute.fullPath}
                      params={{
                        postId: post.id,
                      }}
                      pending
                    >
                      <Spinner />
                    </MatchRoute>
                  </pre>
                </Link>
              </div>
            )
          })}
        </div>
        <div className="flex-1 border-l border-gray-200">
          <Outlet />
        </div>
      </div>
    )
  },
})

const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => {
    return (
      <>
        <div className="p-2">Select a post to view.</div>
      </>
    )
  },
})

const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  parseParams: (params) => ({
    postId: z.number().int().parse(Number(params.postId)),
  }),
  stringifyParams: ({ postId }) => ({ postId: `${postId}` }),
  validateSearch: z.object({
    showNotes: z.boolean().optional(),
    notes: z.string().optional(),
  }),
  loader: async ({
    params: { postId },
    preload,
    context: { loaderClient },
  }) => {
    const loaderOptions = createLoaderOptions({
      key: 'post',
      variables: postId,
    })
    await loaderClient.load({ ...loaderOptions, preload })
    return () => useLoaderInstance(loaderOptions)
  },
  component: ({ useLoader }) => {
    const { data: post } = useLoader()()
    const search = useSearch({ from: postRoute.id })
    const navigate = useNavigate({ from: postRoute.id })

    const [notes, setNotes] = React.useState(search.notes ?? ``)

    React.useEffect(() => {
      navigate({
        search: (old) => ({ ...old, notes: notes ? notes : undefined }),
        replace: true,
      })
    }, [notes])

    return (
      <div className="p-2 space-y-2" key={post.id}>
        <div className="space-y-2">
          <h2 className="font-bold text-lg">
            <input
              defaultValue={post?.id}
              className="border border-opacity-50 rounded p-2 w-full"
              disabled
            />
          </h2>
          <div>
            <textarea
              defaultValue={post?.title}
              rows={6}
              className="border border-opacity-50 p-2 rounded w-full"
              disabled
            />
          </div>
        </div>
        <div>
          <Link
            search={(old) => ({
              ...old,
              showNotes: old?.showNotes ? undefined : true,
            })}
            className="text-blue-700"
          >
            {search.showNotes ? 'Close Notes' : 'Show Notes'}{' '}
          </Link>
          {search.showNotes ? (
            <>
              <div>
                <div className="h-2" />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="shadow w-full p-2 rounded"
                  placeholder="Write some notes here..."
                />
                <div className="italic text-xs">
                  Notes are stored in the URL. Try copying the URL into a new
                  tab!
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute.addChildren([
    dashboardIndexRoute,
    postsRoute.addChildren([postsIndexRoute, postRoute]),
  ]),
])

const router = new Router({
  routeTree,
  defaultPendingComponent: () => (
    <div className={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
  context: {
    loaderClient,
  },
})

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <LoaderClientProvider client={loaderClient}>
      <RouterProvider router={router} defaultPreload="intent" />
    </LoaderClientProvider>,
  )
}
