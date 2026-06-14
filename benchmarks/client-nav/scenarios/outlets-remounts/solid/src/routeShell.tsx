import { createRenderEffect, type JSX } from 'solid-js'
import {
  getOutletsRemountsComponentRenderCount,
  recordComponentMount,
  recordComponentRender,
} from './outletsRemountsRuntime'
import type { OutletsRemountsComponentId } from '../../shared'

export function RouteShell(props: {
  routeId: OutletsRemountsComponentId
  marker: () => string
  children?: JSX.Element
}) {
  const mountIndex = recordComponentMount(props.routeId, props.marker())
  let checksum = 0

  createRenderEffect(() => {
    checksum = recordComponentRender(props.routeId, props.marker())
  })

  return (
    <section
      data-outlets-route={props.routeId}
      data-outlets-marker={props.marker()}
      data-outlets-mount-index={mountIndex}
      data-outlets-render-count={getOutletsRemountsComponentRenderCount(
        props.routeId,
      )}
    >
      <span data-outlets-checksum={checksum} />
      {props.children}
    </section>
  )
}
