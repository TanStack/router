import * as Vue from 'vue'
import type { ErrorRouteComponent } from './route'

type CatchBoundaryProps = {
  getResetKey: () => unknown
  children: Vue.VNode
  errorComponent?: ErrorRouteComponent | Vue.Component
  onCatch?: (error: Error) => void
}

const VueErrorBoundary = Vue.defineComponent({
  name: 'VueErrorBoundary',
  props: {
    onError: Function,
    resetKey: [String, Number, Object],
    children: null,
    errorComponent: null,
  },
  setup(props) {
    const error = Vue.ref<Error | null>(null)

    const reset = () => {
      error.value = null
    }

    Vue.watch(
      () => props.resetKey,
      (newKey, oldKey) => {
        if (newKey !== oldKey && error.value) {
          reset()
        }
      },
    )

    Vue.onErrorCaptured((err: Error) => {
      if (
        err instanceof Promise ||
        (err && typeof (err as any).then === 'function')
      ) {
        return false
      }

      error.value = err

      if (props.onError) {
        props.onError(err)
      }

      return false
    })

    return () =>
      error.value
        ? Vue.h(props.errorComponent ?? ErrorComponent, {
            error: error.value,
            reset,
          })
        : (props.children as Vue.VNode)
  },
})

export function CatchBoundary(props: CatchBoundaryProps) {
  return Vue.h(VueErrorBoundary, {
    resetKey: props.getResetKey() as any,
    onError: props.onCatch,
    children: props.children,
    errorComponent: props.errorComponent,
  })
}
CatchBoundary.inheritAttrs = false
CatchBoundary.props = ['getResetKey', 'children', 'errorComponent', 'onCatch']

export const ErrorComponent = Vue.defineComponent({
  name: 'ErrorComponent',
  props: {
    error: Object,
    reset: Function,
  },
  setup(props) {
    const show = Vue.ref(process.env.NODE_ENV !== 'production')

    const toggleShow = () => {
      show.value = !show.value
    }

    return () =>
      Vue.h('div', { style: { padding: '.5rem', maxWidth: '100%' } }, [
        Vue.h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '.5rem' } },
          [
            Vue.h(
              'strong',
              { style: { fontSize: '1rem' } },
              'Something went wrong!',
            ),
            Vue.h(
              'button',
              {
                style: {
                  appearance: 'none',
                  fontSize: '.6em',
                  border: '1px solid currentColor',
                  padding: '.1rem .2rem',
                  fontWeight: 'bold',
                  borderRadius: '.25rem',
                },
                onClick: toggleShow,
              },
              show.value ? 'Hide Error' : 'Show Error',
            ),
          ],
        ),
        Vue.h('div', { style: { height: '.25rem' } }),
        show.value
          ? Vue.h('div', {}, [
              Vue.h(
                'pre',
                {
                  style: {
                    fontSize: '.7em',
                    border: '1px solid red',
                    borderRadius: '.25rem',
                    padding: '.3rem',
                    color: 'red',
                    overflow: 'auto',
                  },
                },
                [
                  props.error?.message
                    ? Vue.h('code', {}, props.error.message)
                    : null,
                ],
              ),
            ])
          : null,
      ])
  },
})
