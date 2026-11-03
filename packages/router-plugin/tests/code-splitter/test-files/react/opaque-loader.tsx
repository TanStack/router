import { createFileRoute } from '@tanstack/react-router'
import { makeLoader } from './loader'

const options = {
  loader: makeLoader(),
  component: () => <p>posts</p>,
}

export const Route = createFileRoute('/posts')(options)
