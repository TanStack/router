// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom client entry is working
import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start/client'

console.log("[client-entry]: using custom client entry in 'src/client.tsx'")

hydrate(() => <StartClient />, document.body)
