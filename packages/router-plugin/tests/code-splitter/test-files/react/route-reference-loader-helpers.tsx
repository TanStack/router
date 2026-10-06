import { createFileRoute } from '@tanstack/react-router'

const formatter = new Intl.NumberFormat('en')

let label = 'initial'
label = 'updated'

async function fetchPosts() {
  return [formatter.format(1), label]
}

export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  component: () => {
    const posts = Route.useLoaderData()
    return <ul>{posts.length}</ul>
  },
})
