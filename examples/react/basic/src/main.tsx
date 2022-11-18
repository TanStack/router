import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createReactRouter,
  createRouteConfig,
  Link,
  useMatch,
  RegisteredRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

const rootRoute = createRouteConfig()

const indexRoute = rootRoute.createRoute({
  path: '/',
  component: Index,
})

const postsRoute = rootRoute.createRoute({
  path: 'posts',
  component: Posts,
  errorComponent: () => 'Oh crap',
  loader: async () => {
    return {
      posts: await fetchPosts(),
    }
  },
})

const PostsIndexRoute = postsRoute.createRoute({
  path: '/',
  component: PostsIndex,
})

const postRoute = postsRoute.createRoute({
  path: 'post/:postId',
  component: Post,
  loader: async ({ params: { postId } }) => {
    return {
      post: await fetchPostById(postId),
    }
  },
})

const routeConfig = createRouteConfig().addChildren([
  indexRoute,
  postsRoute.addChildren([PostsIndexRoute, postRoute]),
])

// Set up a ReactRouter instance
const router = createReactRouter({
  routeConfig,
  // defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface RegisterRouter {
    router: typeof router
  }
}

function App() {
  return (
    // Build our routes and render our router
    <>
      <RouterProvider router={router}>
        <div>
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
        <Outlet /> {/* Start rendering router matches */}
        <TanStackRouterDevtools position="bottom-right" />
      </RouterProvider>
    </>
  )
}

async function fetchPosts() {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

async function fetchPostById(postId: string) {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))

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
  } = useMatch(postsRoute.id)

  return (
    <div>
      <div
        style={{
          float: 'left',
          marginRight: '1rem',
        }}
      >
        {posts?.map((post) => {
          return (
            <div key={post.id}>
              <Link
                to={postRoute.id}
                params={{
                  postId: post.id,
                }}
                activeProps={{ className: 'font-bold' }}
              >
                <pre>{post.title.substring(0, 20)}</pre>
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
      <div>Select a post.</div>
    </>
  )
}

function Post() {
  const {
    loaderData: { post },
    params: { postId },
  } = useMatch(postRoute.id)

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
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
