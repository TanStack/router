import { LoaderClient } from '@tanstack/react-loaders'
import { postsLoader } from './routes/posts'
import { postLoader } from './routes/posts/$postId'

export const createLoaderClient = () => {
  return new LoaderClient({
    loaders: [postsLoader, postLoader],
  })
}

// Register things for typesafety
declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: ReturnType<typeof createLoaderClient>
  }
}
