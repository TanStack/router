import { notFound } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import axios from 'redaxios'

export type PostType = {
  id: string
  title: string
  body: string
}

// resolved at request time (server-side only) so the built app picks up the
// dummy server the e2e harness starts — Playwright at test time, the vite
// config at prerender build time
function getQueryURL() {
  if (process.env.VITE_NODE_ENV === 'test') {
    return `http://localhost:${process.env.VITE_EXTERNAL_PORT}`
  }
  return 'https://jsonplaceholder.typicode.com'
}

export const fetchPost = createServerFn({ method: 'GET' })
  .validator((postId: string) => postId)
  .handler(async ({ data: postId }) => {
    console.info(`Fetching post with id ${postId} from ${getQueryURL()}...`)
    const post = await axios
      .get<PostType>(`${getQueryURL()}/posts/${postId}`)
      .then((r) => r.data)
      .catch((err) => {
        console.error(err)
        if (err.status === 404) {
          throw notFound()
        }
        throw err
      })

    return post
  })

export const fetchPosts = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.info(`Fetching posts from ${getQueryURL()}...`)
    return axios
      .get<Array<PostType>>(`${getQueryURL()}/posts`)
      .then((r) => r.data.slice(0, 10))
  },
)
