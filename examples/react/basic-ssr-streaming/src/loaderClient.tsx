import { Loader, LoaderClient } from '@tanstack/react-loaders'

export type PostType = {
  id: string
  title: string
  body: string
}

export const postsLoader = new Loader({
  fn: async () => {
    console.log('Fetching posts...')
    await new Promise((r) =>
      setTimeout(r, 300 + Math.round(Math.random() * 300)),
    )
    return fetch('https://jsonplaceholder.typicode.com/posts')
      .then((d) => d.json() as Promise<PostType[]>)
      .then((d) => d.slice(0, 10))
  },
})

export const postLoader = new Loader({
  fn: async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)

    await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

    return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
      (r) => r.json() as Promise<PostType>,
    )
  },
  onInvalidate: async () => {
    await postsLoader.invalidate()
  },
})

export const createLoaderClient = () => {
  return new LoaderClient({
    getLoaders: () => ({
      postsLoader,
      postLoader,
    }),
  })
}

export const loaderClient = createLoaderClient()

// Register things for typesafety
declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: ReturnType<typeof createLoaderClient>
  }
}
