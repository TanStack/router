import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createReactRouter,
  createRouteConfig,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

const routeConfig = createRouteConfig().addChildren((createRoute) => [
  createRoute({ path: '/', element: <Index /> }),
  createRoute({
    path: 'posts',
    element: <Posts />,
    loader: async () => {
      return {
        posts: await fetchPosts(),
      }
    },
  }).addChildren((createRoute) => [
    createRoute({ path: '/', element: <PostsIndex /> }),
    createRoute({
      path: ':postId',
      element: <Post />,
      loader: async ({ params: { postId } }) => {
        return {
          post: await fetchPostById(postId),
        }
      },
    }),
  ]),
])

// Set up a ReactLocation instance
const router = createReactRouter({
  routeConfig,
})

function App() {
  return (
    // Build our routes and render our router
    <RouterProvider router={router}>
      <div>
        <router.Link
          to="/"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          Home
        </router.Link>{' '}
        <router.Link
          to="/posts"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Posts
        </router.Link>
      </div>
      <hr />
      <Outlet /> {/* Start rendering router matches */}
      <TanStackRouterDevtools position="bottom-right" />
    </RouterProvider>
  )
}

async function fetchPosts() {
  await new Promise((r) => setTimeout(r, 300))
  return await axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 5))
}

async function fetchPostById(postId: string) {
  await new Promise((r) => setTimeout(r, 300))

  return await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)
}

function Index() {
  return (
    <div>
      <h3>Welcome Home!</h3>
    </div>
  )
}

function Posts() {
  const {
    loaderData: { posts },
    Link,
  } = router.useMatch('/posts')

  return (
    <div>
      <div>
        {posts?.map((post) => {
          return (
            <div key={post.id}>
              <Link
                to="/posts/:postId"
                params={{
                  postId: post.id,
                }}
                activeProps={{ className: 'font-bold' }}
              >
                <pre>{post.title}</pre>
              </Link>
            </div>
          )
        })}
      </div>
      <hr />
      <Outlet />
    </div>
  )
}

function PostsIndex() {
  return (
    <>
      <div>Select an post.</div>
    </>
  )
}

function Post() {
  const {
    loaderData: { post },
  } = router.useMatch('/posts/:postId')

  return (
    <div>
      <h4>{post.title}</h4>
      <p>{post.body}</p>
    </div>
  )
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<App />)
}
