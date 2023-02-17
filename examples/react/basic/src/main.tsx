import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Router,
  Link,
  useParams,
  RootRoute,
  Route,
  ErrorComponent,
  createHashHistory,
  useMatch,
} from '@tanstack/router'
import { TanStackRouterDevtools } from '../../../../packages/router-devtools/build/types'
import axios from 'axios'
import {
  LoaderClient,
  Loader,
  LoaderClientProvider,
  useLoaderInstance,
} from '@tanstack/react-loaders'

type PostType = {
  id: string
  title: string
  body: string
}

const fetchPosts = async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

const fetchPost = async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)

  if (!post) {
    throw new NotFoundError(postId)
  }

  return post
}

const postsLoader = new Loader({
  fn: fetchPosts,
})

const postLoader = new Loader({
  fn: fetchPost,
  onInvalidate: () => {
    postsLoader.invalidate()
  },
})

const loaderClient = new LoaderClient({
  getLoaders: () => ({
    posts: postsLoader,
    post: postLoader,
  }),
})

declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}

type RouterContext = {
  loaderClient: typeof loaderClient
}

const rootRoute = RootRoute.withRouterContext<RouterContext>()({
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
  onLoad: async ({ context }) => context.loaderClient.loaders.posts.load(),
  component: () => {
    const match = useMatch({ from: postsRoute.id })
    const postsLoader = useLoaderInstance({
      loader: match.context.loaderClient.loaders.posts,
    })

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {[
            ...postsLoader.state.data,
            { id: 'i-do-not-exist', title: 'Non-existent Post' },
          ]?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postRoute.fullPath}
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

const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => <div>Select a post.</div>,
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
  path: '$postId',
  onLoad: async ({ context: { loaderClient }, params: { postId } }) => {
    await loaderClient.loaders.post.load({
      variables: postId,
    })

    // Return a hook!
    return () =>
      useLoaderInstance({
        loader: loaderClient.loaders.post,
        variables: postId,
      })
  },
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>Post with id "{error.data}" found!</div>
    }

    return <ErrorComponent error={error} />
  },
  component: () => {
    const {
      state: { data },
    } = postRoute.useLoader()()

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

// Set up a Router instance
const router = new Router({
  routeTree,
  defaultPreload: 'intent',
  context: {
    loaderClient,
  },
})

// Register things for typesafety
declare module '@tanstack/router' {
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
