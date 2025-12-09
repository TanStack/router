import * as Vue from 'vue'

/**
 * A body component that handles hydration mismatches from SSR streaming.
 *
 * When using SSR streaming with deferred data, the server may inject scripts
 * into the body after the initial render. This causes Vue hydration to see
 * more children than its virtual DOM expects. The Body component uses Vue's
 * `data-allow-mismatch="children"` attribute to suppress these expected mismatches.
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
    return () => Vue.h('body', { 'data-allow-mismatch': '' }, slots.default?.())
  },
})
