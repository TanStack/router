import * as Vue from 'vue'
import { isServer } from '@tanstack/router-core/isServer'
import { routerContext } from './routerContext'

export type NonRouteComponent =
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

export const nonRouteComponentContext =
  process.env.NODE_ENV !== 'production'
    ? (Symbol('nonRouteComponentContext') as Vue.InjectionKey<
        Readonly<Vue.Ref<NonRouteComponent>>
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
        },
        setup(props, { slots }) {
          Vue.provide(
            nonRouteComponentContext!,
            (isServer ??
              Vue.inject(routerContext, null)?.[0].isServer ??
              typeof window === 'undefined')
              ? Vue.toRef(() => props.value)
              : Vue.computed(() => props.value),
          )
          return () => slots.default?.()
        },
      })
    : undefined

export function renderInNonRouteComponentContext(
  component: Vue.Component,
  props: Record<string, any> | undefined,
  context: NonRouteComponent,
): Vue.VNode {
  return Vue.h(
    NonRouteComponentContextProvider!,
    { value: context },
    { default: () => Vue.h(component, props) },
  )
}
