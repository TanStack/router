import { TanStackRouterDevtoolsPanelCore } from '@tanstack/router-devtools-core'
import { defineComponent, ref, onMounted, onBeforeUnmount, watch, h, markRaw, nextTick } from 'vue'
// Import JSX from 'solid-js' since the props will be passed to Solid components
import type { JSX } from 'solid-js'

// Use type aliases for any router and router state to avoid generic arguments requirement
type AnyRouter = any
type AnyRouterState = any

export interface DevtoolsPanelOptions {
  /**
   * The standard React style object used to style a component with inline styles
   */
  style?: JSX.CSSProperties
  /**
   * The standard React class property used to style a component with classes
   */
  className?: string
  /**
   * A boolean variable indicating whether the panel is open or closed
   */
  isOpen?: boolean
  /**
   * A function that toggles the open and close state of the panel
   */
  setIsOpen?: (isOpen: boolean) => void
  /**
   * Handles the opening and closing the devtools panel
   */
  handleDragStart?: (e: any) => void
  /**
   * A boolean variable indicating if the "lite" version of the library is being used
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

export const TanStackRouterDevtoolsPanel = /*#__PURE__*/ defineComponent<DevtoolsPanelOptions>({
  name: 'TanStackRouterDevtoolsPanel',
  props: [
    'style',
    'className',
    'isOpen',
    'setIsOpen',
    'handleDragStart',
    'router',
    'routerState',
    'shadowDOMTarget'
  ],
  setup(props) {
    const devToolRef = ref<HTMLDivElement | null>(null)
    // Don't store the devtools instance in a ref to avoid Vue's reactivity
    let devtools: TanStackRouterDevtoolsPanelCore | null = null
    
    // Helper function to safely get router state
    const getRouterState = () => {
      if (!props.router) return null
      
      // Try to access router state safely
      try {
        return props.routerState || (props.router.state 
          ? markRaw(props.router.state) 
          : null)
      } catch (e) {
        console.warn('Failed to access router state:', e)
        return null
      }
    }
    
    // Initialize devtools
    onMounted(() => {
      // Delay initialization to ensure router is ready
      nextTick(() => {
        if (!props.router) {
          console.warn('TanStackRouterDevtoolsPanel: No router provided')
          return
        }
        
        // Get router state safely
        const routerState = getRouterState()
        
        // Create a raw instance that's not tracked by Vue's reactivity
        devtools = markRaw(new TanStackRouterDevtoolsPanelCore({
          className: props.className,
          style: props.style,
          isOpen: props.isOpen,
          setIsOpen: props.setIsOpen,
          handleDragStart: props.handleDragStart,
          router: markRaw(props.router),
          routerState: routerState,
          shadowDOMTarget: props.shadowDOMTarget,
        }))
        
        if (devToolRef.value) {
          devtools.mount(devToolRef.value)
        }
      })
    })
    
    // Cleanup on unmount
    onBeforeUnmount(() => {
      if (devtools) {
        devtools.unmount()
        devtools = null
      }
    })
    
    // Watch for changes to props and update devtools
    watch(() => props.router, (newRouter) => {
      if (devtools && newRouter) {
        // Pass raw router instance to avoid Vue's reactivity
        devtools.setRouter(markRaw(newRouter))
        
        // Update router state as well when router changes
        const routerState = getRouterState()
        if (routerState) {
          devtools.setRouterState(routerState)
        }
      }
    }, { immediate: true })
    
    watch(() => props.routerState, (newRouterState) => {
      if (devtools && newRouterState) {
        // Pass raw router state to avoid Vue's reactivity
        devtools.setRouterState(markRaw(newRouterState))
      }
    }, { immediate: true })
    
    watch(() => ({
      className: props.className,
      style: props.style,
      shadowDOMTarget: props.shadowDOMTarget,
    }), (newOptions) => {
      if (devtools) {
        // Pass raw options to avoid Vue's reactivity
        devtools.setOptions(markRaw(newOptions))
      }
    }, { deep: true })
    
    return () => h('div', { ref: devToolRef })
  }
}) 