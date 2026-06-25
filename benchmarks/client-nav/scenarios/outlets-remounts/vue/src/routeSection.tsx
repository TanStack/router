import * as Vue from 'vue'
import {
  getOutletsRemountsComponentRenderCount,
  recordComponentRender,
} from './outletsRemountsRuntime'
import type { OutletsRemountsComponentId } from '../../shared'

export function createRouteSection(
  routeId: OutletsRemountsComponentId,
  marker: string,
  mountIndex: number,
  children: Vue.VNodeChild,
) {
  const checksum = recordComponentRender(routeId, marker)

  return (
    <section
      data-outlets-route={routeId}
      data-outlets-marker={marker}
      data-outlets-mount-index={mountIndex}
      data-outlets-render-count={getOutletsRemountsComponentRenderCount(
        routeId,
      )}
    >
      <span data-outlets-checksum={checksum} />
      {children}
    </section>
  )
}
