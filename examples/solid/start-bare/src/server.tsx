import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
import { Hydration, HydrationScript, NoHydration } from 'solid-js/web'
import { createRouter } from './router'
import type * as Solid from 'solid-js'

function RootDocument(props: { children: Solid.JSX.Element }) {
  return (
    <NoHydration>
      <html>
        <head>
          <HydrationScript />
        </head>
        <body>
          <div id="app">
            <Hydration>{props.children}</Hydration>
          </div>
        </body>
      </html>
    </NoHydration>
  )
}

export default createStartHandler({
  createRouter,
  RootDocument,
})(defaultStreamHandler)
