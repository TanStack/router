import { Outlet, Link, createLazyFileRoute } from '@tanstack/react-router'
import { trpc } from '../../utils/trpc'
import { Route as NotLazyRoute } from './route'

export const Route = createLazyFileRoute('/posts')({
  component: PostsComponent,
})

function PostsComponent() {
  const { postsData } = Route.useLoaderData()

  const { data } = trpc.posts.useQuery(undefined, {
    initialData: postsData,
  })

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {data?.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to={NotLazyRoute.fullPath + '/$postId'}
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
