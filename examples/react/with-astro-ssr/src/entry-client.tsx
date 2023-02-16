import ReactDOM from 'react-dom/client'

import { StartClient } from '@tanstack/start/client'
import { routeTree } from './.start/routes'
import { createLoaderClient } from './.start/loaders'

ReactDOM.hydrateRoot(
  document,
  <StartClient routeTree={routeTree} loaderClient={createLoaderClient()} />,
)
