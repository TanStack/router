import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { App } from '.'
import { router } from './router'
import { loaderClient } from './loaderClient'

const { dehydratedRouter, dehydratedLoaderClient } = (window as any)
  .__DEHYDRATED__

// Hydrate the loader client first
loaderClient.hydrate(dehydratedLoaderClient)

// Hydrate the router next
router.hydrate(dehydratedRouter)

ReactDOM.hydrateRoot(
  document,
  <App router={router} loaderClient={loaderClient} head={''} />,
)
