import * as Vue from 'vue'
import type { AnyRoute } from '@tanstack/router-core'

export type NonRouteComponent =
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

export type NonRouteComponentContextValue =
  | {
      component: 'pendingComponent'
      route: AnyRoute
    }
  | {
      component: 'errorComponent' | 'notFoundComponent'
      route?: undefined
    }

export const nonRouteComponentContext =
  process.env.NODE_ENV !== 'production'
    ? (Symbol('nonRouteComponentContext') as Vue.InjectionKey<
        Vue.ComputedRef<NonRouteComponentContextValue>
      >)
    : undefined

const NonRouteComponentContextProvider =
  process.env.NODE_ENV !== 'production'
    ? Vue.defineComponent({
        name: 'NonRouteComponentContextProvider',
        props: {
          value: {
            type: String as Vue.PropType<NonRouteComponent>,
            required: true,
          },
          route: {
            type: Object as Vue.PropType<AnyRoute>,
            required: false,
          },
        },
        setup(props, { slots }) {
          Vue.provide(
            nonRouteComponentContext!,
            Vue.computed<NonRouteComponentContextValue>(() =>
              props.value === 'pendingComponent'
                ? { component: 'pendingComponent', route: props.route! }
                : { component: props.value },
            ),
          )
          return () => slots.default?.()
        },
      })
    : undefined

export function renderInNonRouteComponentContext(
  component: Vue.Component,
  props: Record<string, any> | undefined,
  context: 'pendingComponent',
  route: AnyRoute,
): Vue.VNode
export function renderInNonRouteComponentContext(
  component: Vue.Component,
  props: Record<string, any> | undefined,
  context: 'errorComponent' | 'notFoundComponent',
): Vue.VNode
export function renderInNonRouteComponentContext(
  component: Vue.Component,
  props: Record<string, any> | undefined,
  context: NonRouteComponent,
  route?: AnyRoute,
): Vue.VNode {
  return Vue.h(
    NonRouteComponentContextProvider!,
    { value: context, route },
    { default: () => Vue.h(component, props) },
  )
}
