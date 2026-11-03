import { Route } from 'object-form-loader-const-read-elsewhere.tsx'
function PostComponent() {
  const post = Route.useLoaderData()
  return <div className="p-2">{post.title}</div>
}
export { PostComponent as component }
