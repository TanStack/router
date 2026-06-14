import { useElementScrollRestoration } from '@tanstack/solid-router'
import {
  SCROLL_CONTAINER_IDS,
  getScrollRestorationKey,
  runScrollRenderComputation,
  type ScrollContainerKey,
} from '../../shared.ts'

export function RestoredMarker(props: { id: ScrollContainerKey }) {
  const restorationId = SCROLL_CONTAINER_IDS[props.id]
  const entry = useElementScrollRestoration({
    id: restorationId,
    getKey: getScrollRestorationKey,
  })

  void runScrollRenderComputation(entry?.scrollY ?? 0)
  return (
    <span
      data-scroll-restored={restorationId}
      data-scroll-restored-y={entry?.scrollY ?? 0}
    />
  )
}
