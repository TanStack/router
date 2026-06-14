import {
  cloneOutletsRemountsComponentCounters,
  cloneOutletsRemountsLifecycleCounters,
  createEmptyOutletsRemountsComponentCounters,
  createEmptyOutletsRemountsLifecycleCounters,
  runOutletsRemountsComputation,
  type OutletsRemountsComponentCounters,
  type OutletsRemountsComponentId,
  type OutletsRemountsLifecycleCounters,
  type OutletsRemountsLifecycleHook,
  type OutletsRemountsRouteId,
} from '../../shared'

let lifecycleCounters = createEmptyOutletsRemountsLifecycleCounters()
let componentCounters = createEmptyOutletsRemountsComponentCounters()

export function resetOutletsRemountsCounters() {
  lifecycleCounters = createEmptyOutletsRemountsLifecycleCounters()
  componentCounters = createEmptyOutletsRemountsComponentCounters()
}

export function getOutletsRemountsLifecycleCounters(): OutletsRemountsLifecycleCounters {
  return cloneOutletsRemountsLifecycleCounters(lifecycleCounters)
}

export function getOutletsRemountsComponentCounters(): OutletsRemountsComponentCounters {
  return cloneOutletsRemountsComponentCounters(componentCounters)
}

function recordLifecycle(
  routeId: OutletsRemountsRouteId,
  hook: OutletsRemountsLifecycleHook,
) {
  lifecycleCounters[routeId][hook] += 1
  void runOutletsRemountsComputation(`${routeId}:${hook}`)
}

export function createRouteLifecycleOptions(routeId: OutletsRemountsRouteId) {
  return {
    onEnter: () => recordLifecycle(routeId, 'enter'),
    onStay: () => recordLifecycle(routeId, 'stay'),
    onLeave: () => recordLifecycle(routeId, 'leave'),
  }
}

export function recordComponentMount(
  routeId: OutletsRemountsComponentId,
  marker: string,
) {
  componentCounters[routeId].mounts += 1
  void runOutletsRemountsComputation(`${routeId}:mount:${marker}`)
  return componentCounters[routeId].mounts
}

export function recordComponentRender(
  routeId: OutletsRemountsComponentId,
  marker: string,
) {
  componentCounters[routeId].renders += 1
  return runOutletsRemountsComputation(`${routeId}:render:${marker}`, 10)
}

export function getOutletsRemountsComponentRenderCount(
  routeId: OutletsRemountsComponentId,
) {
  return componentCounters[routeId].renders
}
