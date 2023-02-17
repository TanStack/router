import { H as Hydrate, _ as __astro_tag_component__ } from '../entry.mjs'
import {
  R as Router,
  r as routeTree,
  L as LoaderClientProvider,
  a as RouterProvider,
} from './routeTree.f436718c.mjs'
import { loaderClient } from './loaderClient.50d6b99a.mjs'
import { jsx } from 'react/jsx-runtime'
import '@astrojs/netlify/netlify-functions.js'
import 'react'
import 'react-dom/server'
import 'jsesc'
import 'use-sync-external-store/shim/with-selector.js'

const router = new Router({
  routeTree,
  context: {
    loaderClient,
  },
  defaultPreload: 'intent',
})

function App() {
  return /* @__PURE__ */ jsx(Hydrate, {
    loaderClient,
    router,
    children: /* @__PURE__ */ jsx(LoaderClientProvider, {
      loaderClient,
      children: /* @__PURE__ */ jsx(RouterProvider, {
        router,
      }),
    }),
  })
}
__astro_tag_component__(App, '@astrojs/react')

export { App }
