import { Link, Outlet, Route } from '@tanstack/react-router'
import { rootRoute } from '../root'

import { useLoaderInstance } from '@tanstack/react-loaders'
import { postIdRoute } from './posts/[postId]'

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: ({ context, preload }) =>
    context.loaderClient.getLoader({ key: 'posts' }).load({ preload }),
  component: Posts,
  getContext: ({ context }) => ({
    getTitle: () =>
      `${
        context.loaderClient.getLoader({ key: 'posts' }).getInstance().state
          .data?.length
      } Posts`,
  }),
})

function Posts() {
  const {
    state: { data: posts },
  } = useLoader({ key: 'posts' })

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {posts.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to={postIdRoute.fullPath}
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
}
