import { Loader, LoaderClient } from '@tanstack/react-loaders'

export type PostType = {
  id: string
  title: string
  body: string
}

// This function is used on the server and client
export const createLoaderClient = () => {
  const postsLoader = new Loader({
    key: 'posts',
    loader: async () => {
      console.log('Fetching posts...')
      await new Promise((r) =>
        setTimeout(r, 300 + Math.round(Math.random() * 300)),
      )
      return fetch('https://jsonplaceholder.typicode.com/posts')
        .then((d) => d.json() as Promise<PostType[]>)
        .then((d) => d.slice(0, 10))
    },
  })

  const postLoader = new Loader({
    key: 'post',
    maxAge: 5000,
    loader: async (postId: string) => {
      console.log(`Fetching post with id ${postId}...`)

      await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

      return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(
        (r) => r.json() as Promise<PostType>,
      )
    },
    onAllInvalidate: async () => {
      await postsLoader.invalidateAll()
    },
  })

  return new LoaderClient({
    getLoaders: () => [postsLoader, postLoader],
  })
}

// Create a loaderClient for the client
export const loaderClient = createLoaderClient()

// Register things for typesafety
declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}
