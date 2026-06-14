import * as Vue from 'vue'
import {
  getOutletsRemountsComponentRenderCount,
  recordComponentRender,
} from './outletsRemountsRuntime'
import type { OutletsRemountsComponentId } from '../../shared'

export type OutletsRemountsParams = Partial<{
  orgId: string
  projectId: string
  boardId: string
  cardId: string
}>

export function readParam(
  params: OutletsRemountsParams,
  key: keyof OutletsRemountsParams,
) {
  const value = params[key]

  if (typeof value === 'string') {
    return value
  }

  return ''
}

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
