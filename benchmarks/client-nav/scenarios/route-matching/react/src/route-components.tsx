import { createRouteMarker, type RouteKind } from '../../shared'

type MarkerProps = {
  kind: RouteKind
  marker: string
}

function RouteMarker(props: MarkerProps) {
  return <main data-bench-route={props.kind} data-bench-marker={props.marker} />
}

export function createMarkerComponent(kind: RouteKind, marker: string) {
  return function BenchRouteMarker() {
    return <RouteMarker kind={kind} marker={marker} />
  }
}

export function RootNotFoundComponent() {
  const marker = createRouteMarker('not-found', 'not-found')
  return <RouteMarker kind={marker.kind} marker={marker.value} />
}
