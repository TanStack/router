import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'

const obj = { name: 'test' }

export const Route = createFileRoute('/')({
  beforeLoad() {
    console.log(obj);
  },
  async loader({ context }) {
    return await fetchPosts(context, obj)
  },
  component() {
    return <Component name={obj.name} />
  },
  pendingComponent() {
    return <PendingComponent />
  },
  notFoundComponent() {
    return <NotFoundComponent />
  },
  errorComponent() {
    return <ErrorComponent />
  },
})

function Component({ name }: { name: string }) {
  return <div>Component {name}</div>
}

function PendingComponent() {
  return <div>Pending {obj.name}</div>
}

function NotFoundComponent() {
  return <div>Not found</div>
}

function ErrorComponent() {
  return <div>Error</div>
}
