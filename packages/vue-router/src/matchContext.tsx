import * as Vue from 'vue'

export const matchContext = Vue.createContext<Vue.Ref<string | undefined>>(
  () => undefined,
)

// N.B. this only exists so we can conditionally call useContext on it when we are not interested in the nearest match
export const dummyMatchContext = Vue.createContext<Vue.Ref<string | undefined>>(
  () => undefined,
)
