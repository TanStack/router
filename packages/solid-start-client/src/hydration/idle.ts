import { StrategyHydrate } from './visible'
import {
  scheduleIdle,
  type HydrationPrefetchStrategy,
  type IdleHydrationOptions,
} from '@tanstack/start-client-core/hydration'
import type { SolidHydrationStrategy } from '../Hydrate'

/* @__NO_SIDE_EFFECTS__ */
export function idle(
  options: IdleHydrationOptions = {},
): SolidHydrationStrategy<'idle', true> & HydrationPrefetchStrategy<'idle'> {
  const timeout = options.timeout ?? 2000
  const setup = (context: any) =>
    scheduleIdle(context.prefetch ?? context.gate.resolve, timeout)

  return {
    _s: setup,
    _h: StrategyHydrate,
  } as SolidHydrationStrategy<'idle', true> & HydrationPrefetchStrategy<'idle'>
}
