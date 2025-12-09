import * as Vue from 'vue'

/**
 * An html wrapper component that handles hydration mismatches from SSR streaming.
 *
 * When using SSR streaming with deferred data, the server may inject scripts
 * into the HTML after the initial render. This causes Vue hydration to see
 * more children than its virtual DOM expects. The Html component uses Vue's
 * `data-allow-mismatch` attribute to suppress these expected mismatches.
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
    return () => Vue.h('html', { 'data-allow-mismatch': '' }, slots.default?.())
  },
})
