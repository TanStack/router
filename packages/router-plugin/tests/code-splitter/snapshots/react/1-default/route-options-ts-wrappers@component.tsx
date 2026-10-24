import { Route } from 'route-options-ts-wrappers.tsx'
function PostsComponent() {
  return <div className="p-2">{Route.useLoaderData().length}</div>
}
export { PostsComponent as component }
