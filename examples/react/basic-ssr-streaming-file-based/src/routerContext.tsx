import type { ApolloClient, PreloadQueryFunction } from '@apollo/client'
export type RouterContext = {
  head: string
  preloadQuery: PreloadQueryFunction
  // userland code doesn't need this, but maybe it would
  // be good to make `context` available to the deserialization
  // process, so I'm already putting this here
  apolloClient: ApolloClient<any>
}
