import * as Vue from 'vue'

export const SafeFragment: new (...args: Array<any>) => any = Vue.defineComponent({
  name: 'SafeFragment',
  setup(_, { slots }): () => Vue.VNode {
    return () => {
      return Vue.h(Vue.Fragment, null, slots.default?.())
    }
  },
})
