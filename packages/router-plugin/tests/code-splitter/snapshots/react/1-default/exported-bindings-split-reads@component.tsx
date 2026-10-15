import {
  Store,
  Card,
  countRender,
} from 'exported-bindings-split-reads.tsx?tsr-shared=1'
import { Route } from 'exported-bindings-split-reads.tsx'
function RouteTitle() {
  return <h1>{Route.useLoaderData().title}</h1>
}
function Page() {
  const store = new Store()
  return (
    <main>
      <RouteTitle />
      <Card title={`${store.items.size} items, render ${countRender()}`} />
    </main>
  )
}
export { Page as component }
