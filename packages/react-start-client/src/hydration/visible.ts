'use client'

import {
  visible as coreVisible,
  withHydrationRenderer,
} from '@tanstack/start-client-core/hydration'
import { GenericHydrate } from '../GenericHydrate'
import type {
  HydrationPrefetchStrategy,
  VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration'
import type { ReactHydrationStrategy } from '../Hydrate'

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options?: VisibleHydrationOptions,
): ReactHydrationStrategy<'visible', true> &
  HydrationPrefetchStrategy<'visible'> {
  return /* @__PURE__ */ withHydrationRenderer(
    coreVisible(options),
    GenericHydrate,
  )
}
