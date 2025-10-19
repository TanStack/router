import { hydrate } from 'solid-js/web'
import { hydrateStart } from '@tanstack/start-client-core/client'
import { StartClient } from '@tanstack/solid-start/client'

const router = await hydrateStart()

hydrate(() => <StartClient router={router} />, document)
