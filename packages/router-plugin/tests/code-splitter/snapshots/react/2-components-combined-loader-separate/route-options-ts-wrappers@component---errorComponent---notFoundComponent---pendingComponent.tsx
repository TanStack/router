import { Route } from 'route-options-ts-wrappers.tsx'
function PostsComponent() {
  return <div className="p-2">{Route.useLoaderData().length}</div>
}
function ErrorComponent() {
  return <div className="p-2">error</div>
}
export { PostsComponent as component }
export { ErrorComponent as errorComponent }
const SplitNotFoundComponent = () => <div className="p-2">not found</div>
export { SplitNotFoundComponent as notFoundComponent }
