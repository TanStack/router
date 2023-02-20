import ReactDOM from 'react-dom/client'

import { StartClient } from '@tanstack/react-start/client'
import { routeTree } from './routes'
import { createLoaderClient } from './loaders'

export function mount() {
  ReactDOM.hydrateRoot(
    document,
    <StartClient routeTree={routeTree} loaderClient={createLoaderClient()} />,
  )
}
