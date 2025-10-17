import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start/client'
import { getRouter } from '#tanstack-router-entry'

const router = await getRouter();

hydrate(() => <StartClient router={router} />, document)
