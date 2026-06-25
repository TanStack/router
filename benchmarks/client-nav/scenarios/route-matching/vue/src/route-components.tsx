import * as Vue from 'vue'
import { createRouteMarker, type RouteKind } from '../../shared'

type MarkerProps = {
  kind: RouteKind
  marker: string
}

function createRouteMarkerElement(props: MarkerProps) {
  return <main data-bench-route={props.kind} data-bench-marker={props.marker} />
}

export function createMarkerComponent(kind: RouteKind, marker: string) {
  return Vue.defineComponent({
    setup() {
      return () => createRouteMarkerElement({ kind, marker })
    },
  })
}

export const RootNotFoundComponent = Vue.defineComponent({
  setup() {
    const marker = createRouteMarker('not-found', 'not-found')
    return () =>
      createRouteMarkerElement({ kind: marker.kind, marker: marker.value })
  },
})
