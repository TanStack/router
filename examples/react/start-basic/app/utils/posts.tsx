import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import axios from 'axios'

export type PostType = {
  id: string
  title: string
  body: string
}

export const fetchPost = createServerFn('GET', async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)
    .catch((err) => {
      if (err.response.status === 404) {
        throw notFound()
      }
      throw err
    })

  return post
})

export const fetchPosts = createServerFn('GET', async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
})
