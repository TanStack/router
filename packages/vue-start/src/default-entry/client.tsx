import { createApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'

hydrateStart().then((router) => {
  const app = createApp(StartClient, { router })
  app.mount(document)
})
