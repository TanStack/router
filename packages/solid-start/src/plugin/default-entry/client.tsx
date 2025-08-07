import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start'
import { createRouter } from '#tanstack-start-router-entry'

const router = createRouter()

hydrate(() => <StartClient router={router} />, document.body)
