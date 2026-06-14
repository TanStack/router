import * as Vue from 'vue'
import { computeSubscriberValue, recordSubscriberUpdate } from './subscriberRuntime'
import type { SubscriberCounterKey } from '../../shared'

export const SubscriberValue = Vue.defineComponent({
  props: {
    kind: {
      type: String as Vue.PropType<SubscriberCounterKey>,
      required: true,
    },
    index: {
      type: Number,
      required: true,
    },
    value: {
      type: Function as Vue.PropType<() => unknown>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      recordSubscriberUpdate(props.kind)

      return (
        <span data-subscriber-kind={props.kind}>
          {computeSubscriberValue(props.index, props.value())}
        </span>
      )
    }
  },
})
