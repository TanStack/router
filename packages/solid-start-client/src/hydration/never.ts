import { never as coreNever } from '@tanstack/start-client-core/hydration'
import { GenericHydrate } from '../GenericHydrate'
import type { SolidHydrationStrategy } from '../Hydrate'

/* @__NO_SIDE_EFFECTS__ */
export function never(): SolidHydrationStrategy<'never', false> {
  return /* @__PURE__ */ Object.assign(coreNever(), {
    _h: GenericHydrate,
  })
}
