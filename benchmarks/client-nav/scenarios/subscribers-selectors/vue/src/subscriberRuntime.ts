import {
  createEmptySubscriberCounts,
  digestSubscriberValue,
  runSubscriberComputation,
} from '../../shared'
import type { SubscriberCounterKey, SubscriberCounts } from '../../shared'

let subscriberCounts = createEmptySubscriberCounts()
let subscriberCountersEnabled = false

export function resetSubscriberCounts() {
  subscriberCounts = createEmptySubscriberCounts()
}

export function getSubscriberCounts(): SubscriberCounts {
  return { ...subscriberCounts }
}

export function setSubscriberCountersEnabled(enabled: boolean) {
  subscriberCountersEnabled = enabled
}

export function recordSubscriberUpdate(kind: SubscriberCounterKey) {
  if (subscriberCountersEnabled) {
    subscriberCounts[kind] += 1
  }
}

export function computeSubscriberValue(index: number, value: unknown) {
  return runSubscriberComputation(digestSubscriberValue(value) + index)
}
