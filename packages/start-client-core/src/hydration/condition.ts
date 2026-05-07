import type { HydrationStrategy } from './types'

const conditionType = 'condition'

export type HydrationCondition = boolean | (() => boolean)

function readCondition(condition: HydrationCondition) {
  return typeof condition === 'function' ? condition() : condition
}

/* @__NO_SIDE_EFFECTS__ */
export function condition(condition: HydrationCondition): HydrationStrategy {
  const conditionValue = readCondition(condition)

  return {
    type: conditionType,
    key: `${conditionType}:${conditionValue ? '1' : '0'}`,
    shouldDefer: () => !readCondition(condition),
    setup: ({ gate }) => {
      if (readCondition(condition)) gate.resolve()
    },
  }
}
