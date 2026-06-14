import { computeSubscriberValue, recordSubscriberUpdate } from './subscriberRuntime'
import type { SubscriberCounterKey } from '../../shared'

export function SubscriberValue(props: {
  kind: SubscriberCounterKey
  index: number
  value: unknown
}) {
  recordSubscriberUpdate(props.kind)

  return (
    <span data-subscriber-kind={props.kind}>
      {computeSubscriberValue(props.index, props.value)}
    </span>
  )
}
