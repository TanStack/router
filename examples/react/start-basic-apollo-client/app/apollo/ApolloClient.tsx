import {
  ReadFromReadableStreamLink,
  TeeToReadableStreamLink,
  ApolloClient as _ApolloClient,
} from '@apollo/client-react-streaming'
import { ApolloLink } from '@apollo/client/index.js'
import { ensureHydrated } from './createQueryPreloader'
import type { HookWrappers } from '@apollo/client/react/internal'

function id<T>(x: T): T {
  return x
}

const WRAPPERS = Symbol.for('apollo.hook.wrappers')

export class ApolloClient extends _ApolloClient {
  constructor(options: ConstructorParameters<typeof _ApolloClient>[0]) {
    super(options)
    this.setLink(this.link)

    const queryManager = this['queryManager'] as { [WRAPPERS]: HookWrappers }

    const origWrappers = { ...queryManager[WRAPPERS] }

    queryManager[WRAPPERS] = {
      ...origWrappers,
      useReadQuery: (originalHook) => (queryRef) => {
        return (origWrappers.useReadQuery || id)(originalHook)(
          ensureHydrated(queryRef, this),
        )
      },
      useQueryRefHandlers: (originalHook) => (queryRef) => {
        return (origWrappers.useQueryRefHandlers || id)(originalHook)<any, any>(
          ensureHydrated(queryRef, this),
        )
      },
    } satisfies HookWrappers
  }

  setLink(newLink: ApolloLink) {
    _ApolloClient.prototype.setLink.call(
      this,
      ApolloLink.from([
        ReadFromReadableStreamLink,
        TeeToReadableStreamLink,
        newLink,
      ]),
    )
  }
}
