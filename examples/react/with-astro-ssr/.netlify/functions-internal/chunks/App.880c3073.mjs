import {
  _ as __astro_tag_component__,
  H as Hydrate,
} from './Hydrate.ff008fd4.mjs'
import {
  R as Router,
  r as routeTree,
  L as LoaderClientProvider,
  a as RouterProvider,
} from './routeTree.2e12cfef.mjs'
import { loaderClient } from './loaderClient.1e71ba34.mjs'
import { jsx } from 'react/jsx-runtime'
import 'react'
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
