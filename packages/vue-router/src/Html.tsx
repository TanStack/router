import * as Vue from 'vue'
import { Body } from './Body'

/**
 * An html wrapper component that handles SSR hydration.
 *
 * On the server, this renders a full `<html>` element with its children.
 * On the client, Vue mounts to #__app inside body, so this component
 * finds the Body child and renders it (Body handles the client-side rendering).
 * Head children are teleported to document.head after hydration completes.
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

    // Track if hydration is complete - start teleporting head content only after
    const hydrated = Vue.ref(false)

    if (!isServer) {
      Vue.onMounted(() => {
        // Mark hydrated after mount to start teleporting head content
        hydrated.value = true
      })
    }

    return () => {
      if (isServer) {
        // On server, render the full <html> element
        return Vue.h('html', {}, slots.default?.())
      }

      // On client, we're mounted to #__app which is inside body.
      // Find the Body component and render it - Body handles client-side rendering.
      const children = slots.default?.() || []

      // Find the Body component's VNode and collect head children
      const flatChildren = Array.isArray(children) ? children : [children]
      let bodyVnode: Vue.VNode | null = null
      const headChildren: Array<Vue.VNode> = []

      for (const child of flatChildren) {
        if (typeof child === 'object' && child !== null) {
          const vnode = child
          // Collect <head> children for teleporting (only after hydration)
          if (vnode.type === 'head') {
            // Extract children from the head element
            if (vnode.children) {
              if (Array.isArray(vnode.children)) {
                for (const c of vnode.children) {
                  if (typeof c === 'object' && c !== null && 'type' in c) {
                    headChildren.push(c as Vue.VNode)
                  }
                }
              }
            }
            continue
          }
          // Check if this is the Body component
          if (vnode.type === Body) {
            bodyVnode = vnode
            continue
          }
          // For non-Body elements, treat as body content
          if (!bodyVnode) {
            bodyVnode = vnode
          }
        }
      }

      // Create result array with Body and teleported head content
      const result: Array<Vue.VNode> = []

      if (bodyVnode) {
        result.push(bodyVnode)
      }

      // Only teleport head children to document.head AFTER hydration is complete
      // During hydration, head content is already in the DOM from SSR
      if (hydrated.value && headChildren.length > 0) {
        result.push(
          Vue.h(
            Vue.Teleport,
            { to: 'head' },
            headChildren,
          ),
        )
      }

      return result.length === 1 ? result[0] : Vue.h(Vue.Fragment, result)
    }
  },
})
