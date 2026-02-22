import * as Vue from 'vue'

export const matchContext = Symbol('TanStackRouterMatch') as Vue.InjectionKey<
  Vue.Ref<string | undefined>
>

export const dummyMatchContext = Symbol(
  'TanStackRouterDummyMatch',
) as Vue.InjectionKey<Vue.Ref<string | undefined>>
