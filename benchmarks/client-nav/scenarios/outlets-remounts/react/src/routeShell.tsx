import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  getOutletsRemountsComponentRenderCount,
  recordComponentMount,
  recordComponentRender,
} from './outletsRemountsRuntime'
import type { OutletsRemountsComponentId } from '../../shared'

function useRouteInstrumentation(
  routeId: OutletsRemountsComponentId,
  marker: string,
) {
  const [mountIndex] = useState(() => recordComponentMount(routeId, marker))
  const checksum = recordComponentRender(routeId, marker)

  return {
    checksum,
    mountIndex,
    renderCount: getOutletsRemountsComponentRenderCount(routeId),
  }
}

export function RouteShell(props: {
  routeId: OutletsRemountsComponentId
  marker: string
  children?: ReactNode
}) {
  const instrumentation = useRouteInstrumentation(props.routeId, props.marker)

  return (
    <section
      data-outlets-route={props.routeId}
      data-outlets-marker={props.marker}
      data-outlets-mount-index={instrumentation.mountIndex}
      data-outlets-render-count={instrumentation.renderCount}
    >
      <span data-outlets-checksum={instrumentation.checksum} />
      {props.children}
    </section>
  )
}
