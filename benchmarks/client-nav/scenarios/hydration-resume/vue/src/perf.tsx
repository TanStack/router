import * as Vue from 'vue'
import {
  runHydrationResumeComputation,
  type HydrationResumeDeferredPayload,
} from '../../shared.ts'

export const subscriberSlots = Array.from({ length: 4 }, (_, index) => index)

export const PerfSubscriber = Vue.defineComponent({
  props: {
    seed: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    return () => {
      void runHydrationResumeComputation(props.seed)
      return null
    }
  },
})

export const DeferredResolved = Vue.defineComponent({
  props: {
    payload: {
      type: Object as () => HydrationResumeDeferredPayload,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () => {
      void runHydrationResumeComputation(props.payload.checksum)

      return (
        <div
          data-hydration-resume-marker="deferred-resolved"
          data-item-id={props.payload.itemId}
          data-source={props.source}
          data-value={props.payload.value}
        />
      )
    }
  },
})
