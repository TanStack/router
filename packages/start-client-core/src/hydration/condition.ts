import type { HydrationStrategy } from './types'

const conditionType = 'condition'

export type HydrationCondition = boolean | (() => boolean)

function readCondition(condition: HydrationCondition) {
  return typeof condition === 'function' ? condition() : condition
}

/* @__NO_SIDE_EFFECTS__ */
export function condition(
  condition: HydrationCondition,
): HydrationStrategy<typeof conditionType, false> {
  return {
    _t: conditionType,
    _d: () => !readCondition(condition),
    _s: ({ gate }) => {
      if (readCondition(condition)) gate!.resolve()
    },
  }
}
