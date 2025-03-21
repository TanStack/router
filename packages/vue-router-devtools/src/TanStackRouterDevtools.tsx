import { TanStackRouterDevtoolsCore } from '@tanstack/router-devtools-core'
import { defineComponent, ref, onMounted, onBeforeUnmount, watch, h } from 'vue'
// Import JSX from 'solid-js' since the props will be passed to Solid components
import type { JSX } from 'solid-js'

// Use type aliases for any router and router state to avoid generic arguments requirement
type AnyRouter = any
type AnyRouterState = any

export interface DevtoolsOptions {
  /**
   * Set this true if you want the dev tools to default to being open
   */
  initialIsOpen?: boolean
  /**
   * Use this to add props to the panel. For example, you can add className, style (merge and override default style), etc.
   */
  panelProps?: JSX.HTMLAttributes<HTMLDivElement>
  /**
   * Use this to add props to the close button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  closeButtonProps?: JSX.ButtonHTMLAttributes<HTMLButtonElement>
  /**
   * Use this to add props to the toggle button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  toggleButtonProps?: JSX.ButtonHTMLAttributes<HTMLButtonElement>
  /**
   * The position of the TanStack Router logo to open and close the devtools panel.
   * Defaults to 'bottom-left'.
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /**
   * Use this to render the devtools inside a different type of container element for a11y purposes.
   * Any string which corresponds to a valid intrinsic JSX element is allowed.
   * Defaults to 'footer'.
   */
  containerElement?: string | any
  /**
   * The router instance to use for the devtools.
   */
  router?: AnyRouter
  /**
   * The router state to use for the devtools.
   */
  routerState?: AnyRouterState
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

export const TanStackRouterDevtools = /*#__PURE__*/ defineComponent<DevtoolsOptions>({
  name: 'TanStackRouterDevtools',
  props: [
    'initialIsOpen',
    'panelProps',
    'closeButtonProps',
    'toggleButtonProps',
    'position',
    'containerElement',
    'router',
    'routerState',
    'shadowDOMTarget'
  ],
  setup(props) {
    const devToolRef = ref<HTMLDivElement | null>(null)
    const devtools = ref<TanStackRouterDevtoolsCore | null>(null)
    
    // Initialize devtools
    onMounted(() => {
      devtools.value = new TanStackRouterDevtoolsCore({
        initialIsOpen: props.initialIsOpen,
        panelProps: props.panelProps,
        closeButtonProps: props.closeButtonProps,
        toggleButtonProps: props.toggleButtonProps,
        position: props.position,
        containerElement: props.containerElement,
        router: props.router,
        routerState: props.routerState,
        shadowDOMTarget: props.shadowDOMTarget,
      })
      
      if (devToolRef.value) {
        devtools.value.mount(devToolRef.value)
      }
    })
    
    // Cleanup on unmount
    onBeforeUnmount(() => {
      if (devtools.value) {
        devtools.value.unmount()
      }
    })
    
    // Watch for changes to props and update devtools
    watch(() => props.router, (newRouter) => {
      if (devtools.value && newRouter) {
        devtools.value.setRouter(newRouter)
      }
    }, { immediate: true })
    
    watch(() => props.routerState, (newRouterState) => {
      if (devtools.value && newRouterState) {
        devtools.value.setRouterState(newRouterState)
      }
    }, { immediate: true })
    
    watch(() => ({
      initialIsOpen: props.initialIsOpen,
      panelProps: props.panelProps,
      closeButtonProps: props.closeButtonProps,
      toggleButtonProps: props.toggleButtonProps,
      position: props.position,
      containerElement: props.containerElement,
      shadowDOMTarget: props.shadowDOMTarget,
    }), (newOptions) => {
      if (devtools.value) {
        devtools.value.setOptions(newOptions)
      }
    }, { deep: true })
    
    return () => h('div', { ref: devToolRef })
  }
})
