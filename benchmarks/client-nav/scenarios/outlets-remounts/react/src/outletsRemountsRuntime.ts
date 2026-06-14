import { createOutletsRemountsRuntime } from '../../shared'

export const {
  createRouteLifecycleOptions,
  getOutletsRemountsComponentCounters,
  getOutletsRemountsComponentRenderCount,
  getOutletsRemountsLifecycleCounters,
  recordComponentMount,
  recordComponentRender,
  resetOutletsRemountsCounters,
} = createOutletsRemountsRuntime()
