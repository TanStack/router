import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createReactRouter,
  createRouteConfig,
  Link,
  useLoaderData,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

const rootRoute = createRouteConfig({
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

const indexRoute = rootRoute.createRoute({
  path: '/',
  component: () => {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const postsRoute = rootRoute.createRoute({
  path: 'posts',
  loader: async () => {
    console.log('Fetching posts...')
    await new Promise((r) => setTimeout(r, 500))
    const posts = await axios
      .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
      .then((r) => r.data.slice(0, 10))

    return {
      posts,
    }
  },
  component: () => {
    const { posts } = useLoaderData({ from: postsRoute.id })

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {posts?.map((post) => {
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
  errorComponent: () => 'Oh crap',
})

const PostsIndexRoute = postsRoute.createRoute({
  path: '/',
  component: () => {
    return (
      <>
        <div>Select a post.</div>
      </>
    )
  },
})

const postRoute = postsRoute.createRoute({
  path: 'post/$postId',
  loader: async ({ params: { postId } }) => {
    console.log(`Fetching post with id ${postId}...`)
    await new Promise((r) => setTimeout(r, 500))

    const post = await axios
      .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
      .then((r) => r.data)

    return {
      post,
    }
  },
  component: () => {
    const { post } = useLoaderData({ from: postRoute.id })

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})

const routeConfig = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([PostsIndexRoute, postRoute]),
])

// Set up a ReactRouter instance
const router = createReactRouter({
  routeConfig,
  defaultPreload: 'intent',
})

// Register your router for typesafety
declare module '@tanstack/react-router' {
  interface RegisterRouter {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
