/// <reference types="vinxi/types/server" />
import { renderAsset } from '@vinxi/react'
import React, { Suspense } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { eventHandler } from 'vinxi/server'

import App from './app'

export default eventHandler(async (event) => {
  const clientManifest = import.meta.env.MANIFEST['client']
  const assets = await clientManifest.inputs[clientManifest.handler].assets()
  const events = {}
  console.log('This is server.')
  const stream = await new Promise(async (resolve) => {
    const stream = renderToPipeableStream(
      <App assets={<Suspense>{assets.map((m) => renderAsset(m))}</Suspense>} />,
      {
        onShellReady() {
          resolve(stream)
        },
        bootstrapModules: [
          clientManifest.inputs[clientManifest.handler].output.path,
        ],
        bootstrapScriptContent: `window.manifest = ${JSON.stringify(
          await clientManifest.json(),
        )}`,
      },
    )
  })

  event.node.res.setHeader('Content-Type', 'text/html')
  return stream
})
