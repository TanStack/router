import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { createRouter } from './router'
import { App } from '.'
import { createLoaderClient } from './loaderClient'

const router = createRouter()
const loaderClient = createLoaderClient()

const { dehydratedRouter, dehydratedLoaderClient } = (window as any)
  .__DEHYDRATED__

router.hydrate(dehydratedRouter)
loaderClient.hydrate(dehydratedLoaderClient)

ReactDOM.hydrateRoot(
  document,
  <App router={router} loaderClient={loaderClient} />,
)
