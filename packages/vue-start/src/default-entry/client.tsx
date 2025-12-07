import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'

hydrateStart().then((router) => {
  const app = createSSRApp(StartClient, { router })
  app.mount('html')
})
