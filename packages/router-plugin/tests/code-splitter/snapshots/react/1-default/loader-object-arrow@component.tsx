import { Route } from 'loader-object-arrow.tsx'
function PostComponent() {
  const post = Route.useLoaderData()
  return <div>{post.title}</div>
}
export { PostComponent as component }
