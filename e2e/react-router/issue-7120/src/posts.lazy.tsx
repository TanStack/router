import { createLazyRoute } from '@tanstack/react-router'

export const Route = createLazyRoute('/posts')({
  component: PostsComponent,
})

function PostsComponent() {
  const posts = Route.useLoaderData()

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title.slice(0, 20)}</li>
      ))}
    </ul>
  )
}
