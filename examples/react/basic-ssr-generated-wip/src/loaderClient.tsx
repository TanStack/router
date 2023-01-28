import { Loader, LoaderClient } from '@tanstack/react-loaders'

export type PostType = {
  id: string
  title: string
  body: string
}

export const postsLoader = new Loader({
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

export const postLoader = new Loader({
  key: 'post',
  loader: async (postId: number) => {
    console.log(`Fetching post with id ${postId}...`)

    await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)))

    const post = await fetch(
      `https://jsonplaceholder.typicode.com/posts/${postId}`,
    ).then((r) => r.json() as Promise<PostType>)

    return {
      post,
    }
  },
  onAllInvalidate: async () => {
    await postsLoader.invalidateAll()
  },
})

export const createLoaderClient = () => {
  return new LoaderClient({
    getLoaders: () => [postsLoader, postLoader],
  })
}

// Register things for typesafety
declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: ReturnType<typeof createLoaderClient>
  }
}
