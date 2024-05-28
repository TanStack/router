import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { StartClient } from '@tanstack/start'
import { ApolloProvider } from '@apollo/client'
import { createRouter } from './router'
import { makeClient } from './apollo'

const client = makeClient()
const router = createRouter(client)

ReactDOM.hydrateRoot(
  document,
  <ApolloProvider client={client}>
    <StartClient router={router} />
  </ApolloProvider>,
)
