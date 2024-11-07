import { defaultTransformer } from '@tanstack/react-router'
import { createTransportedQueryPreloader } from './createQueryPreloader'
import { getApolloTransformer } from './getApolloTransformer'
import { ApolloProvider } from './ApolloProvider'
import type { PreloadQueryFunction } from '@apollo/client'
import type { AnyRouter } from '@tanstack/react-router'
import type { ApolloClient } from './ApolloClient'

export function routerWithApolloClient<TRouter extends AnyRouter>(
  router: TRouter['options']['context'] extends {
    apolloClient: ApolloClient
    preloadQuery: PreloadQueryFunction
  }
    ? TRouter
    : never,
  apolloClient: ApolloClient,
): TRouter {
  // @ts-ignore unavoidable due to the ternary in arguments
  router.options.context.apolloClient = apolloClient
  // @ts-ignore unavoidable due to the ternary in arguments
  router.options.context.preloadQuery =
    createTransportedQueryPreloader(apolloClient)
  router.options.transformer = defaultTransformer.withTransformers([
    getApolloTransformer(apolloClient),
  ])
  router.options.InnerWrap = ApolloProvider

  return router
}
