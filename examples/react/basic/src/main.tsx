import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  ReactRouter,
  Link,
  useParams,
  RootRoute,
  Route,
  ErrorComponent,
  createHashHistory,
} from '@tanstack/react-router'
import {
  Loader,
  LoaderClient,
  LoaderClientProvider,
  useLoaderInstance,
} from '@tanstack/react-loaders'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

const postsLoader = new Loader({
  key: 'posts',
  loader: async () => {
    console.log('Fetching posts...')
    await new Promise((r) => setTimeout(r, 500))
    return axios
      .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
      .then((r) => r.data.slice(0, 10))
  },
})

const postLoader = new Loader({
  key: 'post',
  loader: async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)
    await new Promise((r) => setTimeout(r, 500))
    const post = await axios
      .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
      .then((r) => r.data)

    return post
  },
  onAllInvalidate: async () => {
    await postsLoader.invalidateAll()
  },
})

const loaderClient = new LoaderClient({
  getLoaders: () => [postsLoader, postLoader],
})

declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}

const rootRoute = new RootRoute({
  component: () => {
    return (
      <>
        <div className="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/posts"
            activeProps={{
              className: 'font-bold',
            }}
          >
            Posts
          </Link>
        </div>
        <hr />
        <Outlet />
        {/* Start rendering router matches */}
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
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  onLoad: ({ preload }) =>
    loaderClient.getLoader({ key: 'posts' }).load({ preload }),
  component: () => {
    const postsLoaderInstance = useLoaderInstance({
      key: postsLoader.key,
    })

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {[
            ...postsLoaderInstance.state.data,
            { id: 'i-do-not-exist', title: 'Non-existent Post' },
          ]?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postRoute.id}
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            )
          })}
        </ul>
        <hr />
        <Outlet />
      </div>
    )
  },
})

const PostsIndexRoute = new Route({
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

class NotFoundError extends Error {
  data: string
  constructor(public postId: string) {
    super(`Post with id "${postId}" not found!`)
    this.data = postId
  }
}

const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: 'post/$postId',
  onLoad: async ({ params: { postId } }) => {
    try {
      await postLoader.load({ variables: postId })
    } catch (err) {
      throw new NotFoundError(postId)
    }
  },
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>Post with id "{error.data}" found!</div>
    }

    return <ErrorComponent error={error} />
  },
  component: () => {
    const { postId } = useParams({ from: postRoute.id })
    const postLoaderInstance = useLoaderInstance({
      key: postLoader.key,
      variables: postId,
      // strict: false,
    })

    const post = postLoaderInstance.state.data

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, PostsIndexRoute]),
  indexRoute,
])

const hashHistory = createHashHistory()

// Set up a ReactRouter instance
const router = new ReactRouter({
  history: hashHistory,
  routeTree,
  defaultPreload: 'intent',
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    // <React.StrictMode>
    <LoaderClientProvider loaderClient={loaderClient}>
      <RouterProvider router={router} />
    </LoaderClientProvider>,
    // </React.StrictMode>,
  )
}
