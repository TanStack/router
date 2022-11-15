import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createReactRouter,
  createRouteConfig,
} from '@tanstack/react-router'
import { AppRouter } from '../server/server'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'

import { z } from 'zod'

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000',
    }),
  ],
})

// Build our routes. We could do this in our component, too.
const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({
    path: '/',
    component: Home,
  }),
  createRoute({
    path: 'dashboard',
    component: Dashboard,
    loader: async () => {
      return {
        posts: await trpc.posts.query(),
      }
    },
  }).createChildren((createRoute) => [
    createRoute({ path: '/', component: DashboardHome }),
    createRoute({
      path: 'posts',
      component: Posts,
    }).createChildren((createRoute) => [
      createRoute({
        path: '/',
        component: PostsIndex,
      }),
      createRoute({
        path: ':postId',
        parseParams: (params) => ({
          postId: z.number().int().parse(Number(params.postId)),
        }),
        stringifyParams: ({ postId }) => ({ postId: `${postId}` }),
        validateSearch: z.object({
          showNotes: z.boolean().optional(),
          notes: z.string().optional(),
        }),
        component: PostView,
        loader: async ({ params: { postId }, search: {} }) => {
          const post = await trpc.post.query(postId)

          if (!post) {
            throw new Error('Post not found!')
          }

          return {
            post,
          }
        },
      }),
    ]),
  ]),
])

const router = createReactRouter({
  routeConfig,
})

// Provide our location and routes to our application
function App() {
  return (
    <>
      {/* Normally <Router /> matches and renders our
      routes, but when we pass our own children, we can use
      <Outlet /> to start rendering our matches when we're
      // ready. This also let's us use router API's
      in <Root /> before rendering any routes */}
      <RouterProvider
        router={router}
        defaultPendingComponent={
          <div className={`p-2 text-2xl`}>
            <Spinner />
          </div>
        }
        defaultPreload="intent"
      >
        <Root />
      </RouterProvider>
      <TanStackRouterDevtools router={router} position="bottom-right" />
    </>
  )
}

function Root() {
  const routerState = router.useState()

  return (
    <div className={`min-h-screen flex flex-col`}>
      <div className={`flex items-center border-b gap-2`}>
        <h1 className={`text-3xl p-2`}>Kitchen Sink</h1>
        {/* Show a global spinner when the router is transitioning */}
        <div
          className={`text-3xl duration-300 delay-0 opacity-0 ${
            routerState.isFetching ? ` duration-1000 opacity-40` : ''
          }`}
        >
          <Spinner />
        </div>
      </div>
      <div className={`flex-1 flex`}>
        <div className={`divide-y w-56`}>
          {(
            [
              ['.', 'Home'],
              ['/dashboard', 'Dashboard'],
            ] as const
          ).map(([to, label]) => {
            return (
              <div key={to}>
                <router.Link
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
                </router.Link>
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
  )
}

function Home() {
  const route = router.useMatch('/')

  return (
    <div className={`p-2`}>
      <div className={`text-lg`}>Welcome Home!</div>
      <hr className={`my-2`} />
      <route.Link
        to="/dashboard/posts/:postId"
        params={{
          postId: 3,
        }}
        className={`py-1 px-2 text-xs bg-blue-500 text-white rounded-full`}
      >
        1 New Invoice
      </route.Link>
      <hr className={`my-2`} />
      <div className={`max-w-xl`}>
        As you navigate around take note of the UX. It should feel
        suspense-like, where routes are only rendered once all of their data and
        elements are ready.
        <hr className={`my-2`} />
        To exaggerate async effects, play with the artificial request delay
        slider in the bottom-left corner.
        <hr className={`my-2`} />
        The last 2 sliders determine if link-hover preloading is enabled (and
        how long those preloads stick around) and also whether to cache rendered
        route data (and for how long). Both of these default to 0 (or off).
      </div>
    </div>
  )
}

function Dashboard() {
  const route = router.useMatch('/dashboard')

  return (
    <>
      <div className="flex items-center border-b">
        <h2 className="text-xl p-2">Dashboard</h2>
        <route.Link
          to="/dashboard/posts/:postId"
          params={{
            postId: 3,
          }}
          className="py-1 px-2 text-xs bg-blue-500 text-white rounded-full"
        >
          1 New Invoice
        </route.Link>
      </div>
      <div className="flex flex-wrap divide-x">
        {(
          [
            ['.', 'Summary'],
            ['/dashboard/posts', 'Posts'],
          ] as const
        ).map(([to, label]) => {
          return (
            <route.Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '.' }}
              activeProps={{ className: `font-bold` }}
              className="p-2"
            >
              {label}
            </route.Link>
          )
        })}
      </div>
      <hr />
      <Outlet />
    </>
  )
}

function DashboardHome() {
  const {
    loaderData: { posts },
  } = router.useMatch('/dashboard/')

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{posts.length} total posts</strong>.
      </div>
    </div>
  )
}

function Posts() {
  const {
    loaderData: { posts },
    Link,
    MatchRoute,
  } = router.useMatch('/dashboard/posts')

  // Get the action for a child route
  const invoiceIndexRoute = router.useRoute('/dashboard/posts/')
  const invoiceDetailRoute = router.useRoute('/dashboard/posts/:postId')

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {posts?.map((post) => {
          let foundPending

          // const foundPending = invoiceDetailRoute.action.pending.find(
          //   (d) => d.submission?.id === post.id,
          // )

          // if (foundPending?.submission) {
          //   post = { ...post, ...foundPending.submission }
          // }

          return (
            <div key={post.id}>
              <Link
                to="/dashboard/posts/:postId"
                params={{
                  postId: post.id,
                }}
                preload="intent"
                className="block py-2 px-3 text-blue-700"
                activeProps={{ className: `font-bold` }}
              >
                <pre className="text-sm">
                  #{post.id} - {post.title.slice(0, 10)}{' '}
                  {foundPending ? (
                    <Spinner />
                  ) : (
                    <MatchRoute
                      to="./:postId"
                      params={{
                        postId: post.id,
                      }}
                      pending
                    >
                      <Spinner />
                    </MatchRoute>
                  )}
                </pre>
              </Link>
            </div>
          )
        })}
        {/* {invoiceIndexRoute.action.pending.map((action) => (
          <div key={action.submittedAt}>
            <a href="#" className="block py-2 px-3 text-blue-700">
              <pre className="text-sm">
                #<Spinner /> - {action.submission.title?.slice(0, 10)}
              </pre>
            </a>
          </div>
        ))} */}
      </div>
      <div className="flex-1 border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  )
}

function PostsIndex() {
  return (
    <>
      <div className="p-2">Select a post to view.</div>
    </>
  )
}

function PostView() {
  const {
    loaderData: { post },
    action,
    search,
    Link,
    navigate,
    params,
  } = router.useMatch('/dashboard/posts/:postId')

  const [notes, setNotes] = React.useState(search.notes ?? ``)

  React.useEffect(() => {
    navigate({
      search: (old) => ({ ...old, notes: notes ? notes : undefined }),
      replace: true,
    })
  }, [notes])

  return (
    <div className="p-2 space-y-2">
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
                Notes are stored in the URL. Try copying the URL into a new tab!
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function Spinner() {
  return <div className="inline-block animate-spin px-3">⍥</div>
}

function useSessionStorage<T>(key: string, initialValue: T) {
  const state = React.useState<T>(() => {
    const stored = sessionStorage.getItem(key)
    return stored ? JSON.parse(stored) : initialValue
  })

  React.useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(state[0]))
  }, [state[0]])

  return state
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<App />)
}
