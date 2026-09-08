import * as Vue from 'vue'
import { useStore as useStoreBase } from '@tanstack/vue-store'

type RenderScope = { scope?: Vue.EffectScope }
const renderScopes = new WeakMap<Vue.ComponentInternalInstance, RenderScope>()

export function getRenderScope() {
  const instance = Vue.getCurrentInstance()
  if (Vue.getCurrentScope() || !instance) {
    return undefined
  }

  // Functional renders have an instance but no active effect scope.
  // Replace their subscriptions on each render instead of accumulating watchers.
  let entry = renderScopes.get(instance)
  if (!entry) {
    const owner: RenderScope = {}
    entry = owner
    renderScopes.set(instance, owner)
    const reset = () => {
      const scope = owner.scope
      owner.scope = undefined
      scope?.stop()
    }
    Vue.onBeforeUpdate(reset, instance)
    Vue.onBeforeUnmount(() => {
      reset()
      renderScopes.delete(instance)
    }, instance)
  }

  return (entry.scope ??= Vue.effectScope(true))
}

export const useStore: typeof useStoreBase = (store, selector, options) => {
  const scope = getRenderScope()
  return scope
    ? scope.run(() => useStoreBase(store, selector, options))!
    : useStoreBase(store, selector, options)
}
