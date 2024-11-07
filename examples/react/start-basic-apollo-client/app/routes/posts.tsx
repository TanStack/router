import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { gql, useReadQuery } from '@apollo/client/index.js'
import type { TypedDocumentNode } from '@apollo/client/index.js'

const GET_POSTS: TypedDocumentNode<{
  posts: {
    data: Array<{
      id: string
      title: string
    }>
  }
}> = gql`
  query GetPosts {
    posts(options: { paginate: { page: 1, limit: 5 } }) {
      data {
        id
        title
      }
    }
  }
`

export const Route = createFileRoute('/posts')({
  loader: ({ context }) => {
    const postsRef = context.preloadQuery(GET_POSTS)
    return { postsRef }
  },
  component: PostsComponent,
})

function PostsComponent() {
  const data = Route.useLoaderData()
  const posts = useReadQuery(data.postsRef).data.posts.data

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
