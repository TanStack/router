import { _ as __astro_tag_component__, H as Hydrate } from './Hydrate.f13f5eaa.mjs';
import { R as ReactRouter, r as routeTree, L as LoaderClientProvider, a as RouterProvider } from './routeTree.c870053d.mjs';
import { loaderClient } from './loaderClient.a6c93954.mjs';
import { jsx } from 'react/jsx-runtime';
import 'react';
import 'jsesc';
import 'use-sync-external-store/shim/with-selector.js';

const router = new ReactRouter({
  routeTree,
  context: {
    loaderClient
  },
  defaultPreload: "intent"
});

function App() {
  return /* @__PURE__ */ jsx(Hydrate, {
    loaderClient,
    router,
    children: /* @__PURE__ */ jsx(LoaderClientProvider, {
      loaderClient,
      children: /* @__PURE__ */ jsx(RouterProvider, {
        router
      })
    })
  });
}
__astro_tag_component__(App, "@astrojs/react");

export { App };
