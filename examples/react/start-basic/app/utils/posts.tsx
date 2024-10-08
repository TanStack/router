import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import axios from 'redaxios'

export type PostType = {
  id: string
  title: string
  body: string
}

export const fetchPost = createServerFn({ method: 'GET' })
  .input((d) => d as string)
  .handler(async ({ input }) => {
    console.info(`Fetching post with id ${input}...`)
    const post = await axios
      .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${input}`)
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
    console.info('Fetching posts...')
    return axios
      .get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts')
      .then((r) => r.data.slice(0, 10))
  },
)
