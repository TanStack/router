import { Route } from 'object-form-loader-member-handler.tsx'
function PostsComponent() {
  return <div className="p-2">{Route.useLoaderData().length}</div>
}
export { PostsComponent as component }
