import * as Vue from 'vue'
import { Body } from './Body'

/**
 * An html wrapper component that handles SSR hydration.
 *
 * On the server, this renders a full `<html>` element with its children.
 * On the client, Vue mounts to #__app inside body, so this component
 * finds the Body child and renders it (Body handles the client-side rendering).
 *
 * Use this component in your root layout as the root element:
 *
 * ```tsx
 * import { Html, Body, Scripts } from '@tanstack/vue-router'
 *
 * function RootComponent() {
 *   return (
 *     <Html>
 *       <head>...</head>
 *       <Body>
 *         <Outlet />
 *         <Scripts />
 *       </Body>
 *     </Html>
 *   )
 * }
 * ```
 */
export const Html = Vue.defineComponent({
  name: 'Html',
  setup(_, { slots }) {
    const isServer = typeof window === 'undefined'

    return () => {
      if (isServer) {
        // On server, render the full <html> element
        return Vue.h('html', {}, slots.default?.())
      }

      // On client, we're mounted to #__app which is inside body.
      // Find the Body component and render it - Body handles client-side rendering.
      const children = slots.default?.() || []

      // Find the Body component's VNode
      const flatChildren = Array.isArray(children) ? children : [children]
      for (const child of flatChildren) {
        if (typeof child === 'object' && child !== null) {
          const vnode = child as Vue.VNode
          // Skip <head> elements
          if (vnode.type === 'head') continue
          // Check if this is the Body component - render it directly
          // Body component handles wrapping children in a div for hydration
          if (vnode.type === Body) {
            return vnode
          }
          // For non-Body elements, return them directly
          return vnode
        }
      }

      return null
    }
  },
})
