import * as React from 'react'
import { createRouteConfig, Outlet } from '@tanstack/react-router'
import axios from 'axios'
import { router } from './router'

type PostType = {
  id: string
  title: string
  body: string
}

export const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({
    path: '/',
    element: <Index />,
  }),
  createRoute({
    path: 'posts',
    element: <Posts />,
    errorElement: 'Oh crap!',
    loader: async () => {
      return {
        posts: await fetchPosts(),
      }
    },
  }).createChildren((createRoute) => [
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

async function fetchPosts() {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))
  return axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

async function fetchPostById(postId: string) {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

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
                to="/posts/:postId"
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
  } = router.useMatch('/posts/:postId')

  return (
    <div>
      <h4>{post.title}</h4>
      <p>{post.body}</p>
    </div>
  )
}
