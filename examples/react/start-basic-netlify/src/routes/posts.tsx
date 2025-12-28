import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../utils/posts'

export const Route = createFileRoute('/posts')({
  loader: async () => fetchPosts(),
  component: PostsComponent,
})

/**
 * Render the posts index: a navigable list of posts and an outlet for nested routes.
 *
 * Renders loader-provided posts as links to `/posts/{postId}`, appends a placeholder
 * item with id `"i-do-not-exist"`, truncates titles to 20 characters, and displays
 * an Outlet for nested routes.
 *
 * @returns The component's JSX: a list of post links and an Outlet for nested content.
 */
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
                    postId: String(post.id),
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
