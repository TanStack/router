import { QueryClient } from '@tanstack/solid-query'
import {
  Link,
  Outlet,
  RootRoute,
  Route,
  RouterProvider,
  SolidRouter,
  useParams,
} from '@tanstack/solid-router'
import { httpBatchLink } from '@trpc/client'
import { Component, For, Match, Switch } from 'solid-js'
import { createTRPCSolid } from 'solid-trpc'
import { AppRouter } from '../server/server'

const queryClient = new QueryClient()

export function Spinner() {
  return (
    <div class="animate-spin px-3 text-2xl inline-flex items-center justify-center">
      ⍥
    </div>
  )
}

const rootRoute = new RootRoute({
  component: () => {
    return (
      <>
        <div class="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              class: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/posts"
            activeProps={{
              class: 'font-bold',
            }}
          >
            Posts
          </Link>
        </div>
        <hr />
        <Outlet /> {/* Start rendering router matches */}
      </>
    )
  },
})

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    const helloQuery = trpc.hello.useQuery()

    return (
      <div>
        <div class="p-2 text-xl">{helloQuery.data}</div>
      </div>
    )
  },
})

const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  errorComponent: () => 'Oh crap!',
  // onLoad: async () => {}
  component: () => {
    const postsQuery = trpc.posts.useQuery()

    return (
      <Switch>
        <Match when={postsQuery.isLoading}>
          <Spinner />
        </Match>
        <Match when={postsQuery.data}>
          <div class="p-2 flex gap-2">
            <ul class="list-disc pl-4">
              <For each={postsQuery.data}>
                {(post) => (
                  <li class="whitespace-nowrap">
                    <Link
                      to={postRoute.fullPath}
                      params={{
                        postId: post.id,
                      }}
                      class="block py-1 text-blue-800 hover:text-blue-600"
                      activeProps={{ class: 'text-black font-bold' }}
                    >
                      <div>{post.title.substring(0, 20)}</div>
                    </Link>
                  </li>
                )}
              </For>
            </ul>
            <hr />
            <Outlet />
          </div>
        </Match>
      </Switch>
    )
  },
})

const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => {
    return (
      <>
        <div>Select a post.</div>
      </>
    )
  },
})

const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  onLoad: async () => {
    // TODO: Prefetch post using TRPC
    return {}
  },
  component: () => {
    const params = useParams({ from: postRoute.id })
    const postQuery = trpc.post.useQuery(() => params.postId)

    return (
      <Switch>
        <Match when={postQuery.isLoading}>
          <Spinner />
        </Match>
        <Match when={postQuery.data}>
          <div class="space-y-2">
            <h4 class="text-xl font-bold underline">{postQuery.data?.title}</h4>
          </div>
        </Match>
      </Switch>
    )
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postRoute]),
])

// Set up a SolidRouter instance
const router = new SolidRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPendingComponent: Spinner,
})

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

export const trpc = createTRPCSolid<AppRouter>({})

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000',
    }),
  ],
})

const Root: Component = () => (
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <RouterProvider router={router} />
  </trpc.Provider>
)

export default Root
