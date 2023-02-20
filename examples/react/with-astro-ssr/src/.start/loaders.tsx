import { LoaderClient } from '@tanstack/react-loaders'
import * as loaders from '../loaders/posts'

// This function is used on the server and client
export const createLoaderClient = () => {
  return new LoaderClient({
    getLoaders: () => [...Object.values(loaders)],
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
