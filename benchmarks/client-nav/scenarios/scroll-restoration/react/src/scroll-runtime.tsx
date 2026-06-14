import { useElementScrollRestoration } from '@tanstack/react-router'
import {
  SCROLL_CONTAINER_IDS,
  getScrollRestorationKey,
  runScrollRenderComputation,
} from '../../shared.ts'

export const fillerRows = Array.from({ length: 18 }, (_, index) => index)

export function RestoredMarker(props: {
  id: keyof typeof SCROLL_CONTAINER_IDS
}) {
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
