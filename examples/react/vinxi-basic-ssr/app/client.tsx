/// <reference types="vinxi/types/client" />
import { createAssets } from '@vinxi/react'
import React, { Suspense } from 'react'
import { Root, hydrateRoot } from 'react-dom/client'
import 'vinxi/client'

import App from './app'

const Assets = createAssets(
  import.meta.env.MANIFEST['client'].handler,
  import.meta.env.MANIFEST['client'],
)

window.$root =
  window.$root ||
  hydrateRoot(
    document,
    <App
      assets={
        <Suspense>
          <Assets />
        </Suspense>
      }
    ></App>,
  )

if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (mod) {
      const Assets = createAssets(
        import.meta.env.MANIFEST['client'].handler,
        import.meta.env.MANIFEST['client'],
      )
      window.$root?.render(
        <mod.App
          assets={
            <Suspense>
              <Assets />
            </Suspense>
          }
        />,
      )
    }
  })
}

export { App }

declare global {
  interface Window {
    $root?: Root
  }
}
