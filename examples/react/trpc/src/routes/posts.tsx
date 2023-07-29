import { Link, Outlet, Route } from '@tanstack/router'
import { rootRoute } from './root'
import { postIdRoute } from './posts/$postId'
import { trpc } from '../utils/trpc'

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: async ({ context: { ssg } }) => {
    await ssg.postList.prefetch()
  },
  component: function Posts() {
    const { data: posts } = trpc.postList.useQuery()

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {posts?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postIdRoute.to}
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
