import * as Vue from 'vue'

/**
 * A body component that handles SSR hydration.
 *
 * On the server, this renders `<body><div id="__app">...children...</div></body>`
 * On the client, Vue mounts to #__app, so this component just returns the children.
 *
 * Use this component in your root layout instead of a raw `<body>` tag:
 *
 * ```tsx
 * import { Body, Scripts } from '@tanstack/vue-router'
 *
 * function RootComponent() {
 *   return (
 *     <>
 *       <head>...</head>
 *       <Body>
 *         <Outlet />
 *         <Scripts />
 *       </Body>
 *     </>
 *   )
 * }
 * ```
 */
export const Body = Vue.defineComponent({
  name: 'Body',
  setup(_, { slots }) {
    const isServer = typeof window === 'undefined'

    return () => {
      const children = slots.default?.()

      if (isServer) {
        // On server, render full body structure with #__app wrapper
        // Wrap children in a container div to ensure consistent hydration
        return Vue.h(
          'body',
          {},
          Vue.h('div', { id: '__app' }, Vue.h('div', {}, children)),
        )
      }

      // On client, we're mounted inside #__app
      // Wrap in a div to match the server structure and avoid Fragment mismatch
      return Vue.h('div', {}, children)
    }
  },
})
