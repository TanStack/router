import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { router } from './router'
import { App } from '.'
import { loaderClient } from './loaderClient'

const { dehydratedRouter, dehydratedLoaderClient } = (window as any)
  .__DEHYDRATED__

router.hydrate(dehydratedRouter)
loaderClient.hydrate(dehydratedLoaderClient)

ReactDOM.hydrateRoot(
  document,
  <App router={router} loaderClient={loaderClient} />,
)
