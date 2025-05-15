// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom client entry is working
import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start'
import { createRouter } from './router'

console.log('[client-entry]: using custom client entry in src/client.tsx')

const router = createRouter()

hydrate(() => <StartClient router={router} />, document.body)
