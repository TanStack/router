import { postsLoader, testLoader } from './routes/posts'
import { postLoader } from './routes/posts/$postId'

export const createLoaderClient = () => {
  return new LoaderClient({
    loaders: [postsLoader, postLoader, testLoader],
  })
}
