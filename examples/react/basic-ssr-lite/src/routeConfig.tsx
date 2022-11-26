import * as React from 'react'
import { createRouteConfig, Outlet, useMatch } from '@tanstack/react-router'
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
  path: '$postId',
  component: Post,
  loader: async ({ params: { postId } }) => {
    return {
      post: await fetchPostById(postId),
    }
  },
})

console.log(postRoute)

export const routeConfig = createRouteConfig().addChildren([
  indexRoute,
  postsRoute.addChildren([PostsIndexRoute, postRoute]),
])

async function fetchPosts() {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 300 + Math.round(Math.random() * 300)))
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
                to="/posts/$postId"
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
  } = useMatch(postRoute.id)

  return (
    <div>
      <h4>{post.title}</h4>
      <p>{post.body}</p>
    </div>
  )
}
