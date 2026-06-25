import { Link, createLazyRoute } from '@tanstack/react-router'

export const Route = createLazyRoute('/posts')({
  component: PostsComponent,
})

function PostsComponent() {
  const posts = Route.useLoaderData()

  return (
    <div>
      <ul>
        {posts.map((post) => {
          return (
            <li key={post.id}>
              <Link to="/posts">
                <div>{post.title.substring(0, 20)}</div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
