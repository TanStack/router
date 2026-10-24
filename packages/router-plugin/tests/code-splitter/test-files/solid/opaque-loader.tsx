import { createFileRoute } from '@tanstack/solid-router'
import { makeLoader } from './loader'

const options = {
  loader: makeLoader(),
  component: () => <p>posts</p>,
}

export const Route = createFileRoute('/posts')(options)
