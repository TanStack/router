import { hydrate } from '@solidjs/web'
import { StartClient, hydrateStart } from '@tanstack/solid-start/client'

hydrateStart().then((router) => {
  hydrate(() => <StartClient router={router} />, document)
})
