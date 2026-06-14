import { createMemo, createRenderEffect } from 'solid-js'
import { computeSubscriberValue, recordSubscriberUpdate } from './subscriberRuntime'
import type { SubscriberCounterKey } from '../../shared'

export function SubscriberValue(props: {
  kind: SubscriberCounterKey
  index: number
  value: () => unknown
}) {
  const text = createMemo(() =>
    computeSubscriberValue(props.index, props.value()),
  )

  createRenderEffect(() => {
    text()
    recordSubscriberUpdate(props.kind)
  })

  return <span data-subscriber-kind={props.kind}>{text()}</span>
}
