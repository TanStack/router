import { lazy } from '@tanstack/react-router'
import { routeConfig as parentRouteConfig } from './__root'
import * as React from 'react'
import {
  Link,
  Outlet,
  useLoaderInstance,
  useMatch,
} from '@tanstack/react-router'
import { postspostIdRoute } from '../routes.generated/posts/$postId.client'
const routeConfig = parentRouteConfig.createRoute({
  path: 'posts',
  component: Posts,
  onLoad: (...args) =>
    import('./posts-loader').then((d) => d.loader.apply(d.loader, args as any)),
  errorComponent: () => 'Oh crap',
})
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
export { routeConfig }
