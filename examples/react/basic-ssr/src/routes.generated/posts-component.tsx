import * as React from 'react'
import {
  Link,
  Outlet,
  useLoaderInstance,
  useMatch,
} from '@tanstack/react-router'
import { routeConfig } from '../routes.generated/posts'
import { postspostIdRoute } from '../routes.generated/posts/$postId.client'
function Posts() {
  const { posts } = useLoaderInstance({
    from: routeConfig.id,
  })
  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts?.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to={postspostIdRoute.id}
                params={{
                  postId: post.id,
                }}
                className="block py-1 text-blue-800 hover:text-blue-600"
                activeProps={{
                  className: 'text-black font-bold',
                }}
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
}
export const component = Posts
