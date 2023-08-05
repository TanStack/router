import axios from 'axios'
import { LoaderClient, Loader, typedClient } from '@tanstack/react-loaders'

export type PostType = {
  id: string
  title: string
  body: string
}

export class NotFoundError extends Error {}

const fetchPosts = async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

const fetchPost = async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  try {
    const post = await axios
      .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
      .then((r) => r.data)
    return post
  } catch (err: any) {
    if (err.response.status === 404) {
      throw new NotFoundError(`Post with id "${postId}" not found!`)
    }
    throw err
  }
}

const postsLoader = new Loader({
  key: 'posts',
  fn: fetchPosts,
})

const postLoader = new Loader({
  key: 'post',
  fn: fetchPost,
  onInvalidate: ({ client }) => {
    typedClient(client).invalidateLoader({ key: 'posts' })
  },
})

export const loaderClient = new LoaderClient({
  loaders: [postsLoader, postLoader],
})

declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}
