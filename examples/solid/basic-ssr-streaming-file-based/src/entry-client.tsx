import { RouterClient } from '@tanstack/solid-router/ssr/client'
import { hydrate } from '@solidjs/web'
import { createRouter } from './router'

const router = createRouter()

hydrate(() => <RouterClient router={router} />, document.body)
