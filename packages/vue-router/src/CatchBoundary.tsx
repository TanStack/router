import * as Vue from 'vue'
import type { ErrorRouteComponent } from './route'

// Define the error component props interface
interface ErrorComponentProps {
  error: Error;
  reset: () => void;
}

// Create a Vue error boundary component
const VueErrorBoundary = Vue.defineComponent({
  name: 'VueErrorBoundary',
  props: {
    onError: Function,
    resetKey: [String, Number]
  },
  setup(props, { slots }) {
    const error = Vue.ref<Error | null>(null)
    const resetFn = Vue.ref<(() => void) | null>(null)
    
    const reset = () => {
      error.value = null
    }
    
    // Watch for changes in the reset key
    Vue.watch(() => props.resetKey, (newKey, oldKey) => {
      if (newKey !== oldKey && error.value) {
        reset()
      }
    })
    
    // Capture errors from child components
    Vue.onErrorCaptured((err: Error, instance, info) => {
      error.value = err
      resetFn.value = reset
      
      // Call the onError callback if provided
      if (props.onError) {
        props.onError(err)
      }
      
      // Prevent the error from propagating further
      return false
    })
    
    return () => {
      // If there's an error, render the fallback
      if (error.value && slots.fallback) {
        return slots.fallback({
          error: error.value,
          reset
        })
      }
      
      // Otherwise render the default slot
      return slots.default && slots.default()
    }
  }
})

// Main CatchBoundary component
export function CatchBoundary(props: {
  getResetKey: () => number | string
  children: Vue.VNode
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error) => void
}) {
  // Create a component to use in the template
  const CatchBoundaryWrapper = Vue.defineComponent({
    setup() {
      const resetKey = Vue.computed(() => props.getResetKey())
      
      return () => {
        // Always use our default component as a safe fallback
        const defaultErrorComponent = ErrorComponent
        
        return Vue.h(VueErrorBoundary, {
          resetKey: resetKey.value,
          onError: props.onCatch
        }, {
          default: () => props.children,
          fallback: ({ error, reset }: ErrorComponentProps) => {
            // Safely render the error component - either the provided one or the default
            if (props.errorComponent) {
              // Use the provided error component
              return Vue.h(props.errorComponent, { error, reset })
            } else {
              // Use the default error component
              return Vue.h(defaultErrorComponent, { error, reset })
            }
          }
        })
      }
    }
  })
  
  return Vue.h(CatchBoundaryWrapper)
}

// Error component
export const ErrorComponent = Vue.defineComponent({
  name: 'ErrorComponent',
  props: {
    error: Object,
    reset: Function
  },
  setup(props) {
    const show = Vue.ref(process.env.NODE_ENV !== 'production')
    
    const toggleShow = () => {
      show.value = !show.value
    }
    
    return () => (
      Vue.h('div', { style: { padding: '.5rem', maxWidth: '100%' } }, [
        Vue.h('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem' } }, [
          Vue.h('strong', { style: { fontSize: '1rem' } }, 'Something went wrong!'),
          Vue.h('button', {
            style: {
              appearance: 'none',
              fontSize: '.6em',
              border: '1px solid currentColor',
              padding: '.1rem .2rem',
              fontWeight: 'bold',
              borderRadius: '.25rem'
            },
            onClick: toggleShow
          }, show.value ? 'Hide Error' : 'Show Error')
        ]),
        Vue.h('div', { style: { height: '.25rem' } }),
        show.value ? Vue.h('div', {}, [
          Vue.h('pre', {
            style: {
              fontSize: '.7em',
              border: '1px solid red',
              borderRadius: '.25rem',
              padding: '.3rem',
              color: 'red',
              overflow: 'auto'
            }
          }, [
            props.error?.message ? Vue.h('code', {}, props.error.message) : null
          ])
        ]) : null
      ])
    )
  }
})
