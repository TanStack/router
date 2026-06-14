import * as Vue from 'vue'
import { useElementScrollRestoration } from '@tanstack/vue-router'
import {
  SCROLL_CONTAINER_IDS,
  getScrollRestorationKey,
  runScrollRenderComputation,
} from '../../shared.ts'

type ScrollContainerKey = keyof typeof SCROLL_CONTAINER_IDS

export const fillerRows = Array.from({ length: 18 }, (_, index) => index)

export const RestoredMarker = Vue.defineComponent({
  props: {
    id: {
      type: String as Vue.PropType<ScrollContainerKey>,
      required: true,
    },
  },
  setup(props) {
    const restorationId = SCROLL_CONTAINER_IDS[props.id]
    const entry = useElementScrollRestoration({
      id: restorationId,
      getKey: getScrollRestorationKey,
    })

    return () => {
      void runScrollRenderComputation(entry?.scrollY ?? 0)
      return (
        <span
          data-scroll-restored={restorationId}
          data-scroll-restored-y={entry?.scrollY ?? 0}
        />
      )
    }
  },
})
