import { createSubscribersSelectorsRuntime } from '../../shared'

export const {
  computeSubscriberValue,
  getSubscriberCounts,
  recordSubscriberUpdate,
  resetSubscriberCounts,
  setSubscriberCountersEnabled,
} = createSubscribersSelectorsRuntime()
