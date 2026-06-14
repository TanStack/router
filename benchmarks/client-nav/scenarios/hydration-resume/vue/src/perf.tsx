import * as Vue from 'vue'
import {
  createDeferredResolvedMarkerAttributes,
  hydrationResumeSubscriberSlots,
  runHydrationResumeComputation,
  type HydrationResumeDeferredPayload,
} from '../../shared.ts'

export const subscriberSlots = hydrationResumeSubscriberSlots

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
          {...createDeferredResolvedMarkerAttributes(
            props.payload,
            props.source,
          )}
        />
      )
    }
  },
})
