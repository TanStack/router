import { Loader } from '@tanstack/react-loaders'
import { server$ } from '@tanstack/bling/server'

export type PostType = {
  id: string
  title: string
  body: string
}

export const postsLoader = new Loader({
  key: 'posts',
  loader: server$(async () => {
    console.log('Fetching posts...')
    await new Promise((r) =>
      setTimeout(r, 300 + Math.round(Math.random() * 300)),
    )
    return fetch('https://jsonplaceholder.typicode.com/posts')
      .then((d) => d.json() as Promise<PostType[]>)
      .then((d) => d.slice(0, 10))
  }),
})
export const postLoader = new Loader({
  key: 'post',
  maxAge: 5000,
  loader: server$(async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)

    await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

    return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
      (r) => r.json() as Promise<PostType>,
    )
  }),
  onAllInvalidate: async () => {
    await postsLoader.invalidateAll()
  },
})
