import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { createServerFnClient } from '@tanstack/start'

const serverFnClient = createServerFnClient({
  baseUrl:
    process.env.NODE_ENV === 'production'
      ? 'https://my-site.com/_server'
      : 'http://localhost:3000/_server',
})

export const Route = createFileRoute('/posts')({
  // loader: async () => fetchPosts(),
  loader: () =>
    serverFnClient
      .fetch({
        functionId: 'fetchPosts',
        method: 'GET',
      })
      .then((d) => d.result),
  component: PostsComponent,
})

function PostsComponent() {
  const posts = Route.useLoaderData()

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }].map(
          (post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to="/posts/$postId"
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
          },
        )}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
