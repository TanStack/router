import { createFileRoute } from '@tanstack/react-router'
import { makeLoader } from '../loaders'

// a call result may be an object-form loader: split with the mark
const postsLoader = makeLoader('/posts')

export const Route = createFileRoute('/posts')({
  loader: postsLoader,
  component: () => <p>posts</p>,
})
