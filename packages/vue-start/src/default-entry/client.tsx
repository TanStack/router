import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'

hydrateStart().then((router) => {
  const app = createSSRApp(StartClient, { router })
  // Mount to #__app wrapper div for proper Vue hydration
  // The Body component creates this wrapper on the server
  app.mount('#__app')
})
