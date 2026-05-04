/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  Link,
  Outlet,
  createRoute,
  useLoaderData,
} from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import { listPosts } from '../server/posts'
import type { Handle } from '@remix-run/ui'

interface PostStub {
  slug: string
  title: string
}

function PostsLayout(handle: Handle) {
  const readPosts = useLoaderData(handle, { from: '/posts' })
  return () => {
    const posts = (readPosts() as Array<PostStub>) ?? []
    return (
      <main>
        <h1>Posts</h1>
        <ul>
          {posts.map((p) => (
            <li key={p.slug}>
              <Link to="/posts/$slug" params={{ slug: p.slug }}>
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
        <hr />
        <Outlet />
      </main>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/posts',
  loader: listPosts,
  component: PostsLayout,
})
