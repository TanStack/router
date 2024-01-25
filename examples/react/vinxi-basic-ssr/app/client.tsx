/// <reference types="vinxi/types/client" />
import { createAssets } from '@vinxi/react'
import React, { Suspense } from 'react'
import { Root, hydrateRoot } from 'react-dom/client'
import 'vinxi/client'

import { createRouter } from './router'
import { StartClient } from '@tanstack/react-router-server/client'

render()

function render(mod?: any) {
  const Assets = createAssets(
    import.meta.env.MANIFEST['client'].handler,
    import.meta.env.MANIFEST['client'],
  )

  const router = createRouter()

  router.update({
    context: {
      assets: (
        <Suspense>
          <Assets />
        </Suspense>
      ),
    },
  })

  const app = <StartClient router={router} />

  if (!mod) {
    window.$root = hydrateRoot(document, app)
  } else {
    window.$root?.render(app)
  }
}

if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (mod) {
      render(mod)
    }
  })
}

declare global {
  interface Window {
    $root?: Root
  }
}
