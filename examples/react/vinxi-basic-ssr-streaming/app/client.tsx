/// <reference types="vinxi/types/client" />
import React from 'react'
import { Root, hydrateRoot } from 'react-dom/client'
import 'vinxi/client'

import { createRouter } from './router'
import { StartClient } from '@tanstack/react-router-server/client'

render()

function render(mod?: any) {
  const router = createRouter()

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
