import { hydrateRoot } from 'octane'
import { StartClient, hydrateStart } from '@tanstack/octane-start/client'

hydrateStart().then((router) => {
  const container = document.getElementById('__app')

  if (!container) {
    throw new Error('TanStack Start could not find the Octane hydration root.')
  }

  hydrateRoot(container, StartClient, { router })
})
