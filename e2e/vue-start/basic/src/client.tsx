// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom client entry is working
import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'

console.log("[client-entry]: using custom client entry in 'src/client.tsx'")

hydrateStart().then((router) => {
  const app = createSSRApp(StartClient, { router })
  app.mount('html')
})
