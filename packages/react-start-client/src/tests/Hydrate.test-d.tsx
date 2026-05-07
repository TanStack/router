import { expectTypeOf, test } from 'vitest'
import { Hydrate } from '../Hydrate'
import type {
  HydrateProps,
  HydrationPrefetchStrategy,
  HydrationStrategy,
} from '../Hydrate'
import type { HydrationStrategy as CoreHydrationStrategy } from '@tanstack/start-client-core/hydration'
import type { visible } from '../hydration'
import type { ReactNode } from 'react'

type CommonHydrateProps = {
  fallback?: ReactNode
  onHydrated?: () => void
  children: ReactNode
}

type SplitHydrateProps = CommonHydrateProps & {
  when: HydrationStrategy
  prefetch?: never
  split?: boolean
}

type PrefetchHydrateProps = CommonHydrateProps & {
  when: HydrationStrategy
  prefetch: HydrationPrefetchStrategy
  split?: true
}

test('Hydrate component accepts the public HydrateProps type', () => {
  expectTypeOf(Hydrate).toBeFunction()
  expectTypeOf(Hydrate).parameter(0).branded.toEqualTypeOf<HydrateProps>()
})

test('Hydrate props are exact for strategy and prefetch forms', () => {
  expectTypeOf<
    Extract<HydrateProps, { prefetch?: never }>
  >().branded.toEqualTypeOf<SplitHydrateProps>()
  expectTypeOf<
    Extract<HydrateProps, { prefetch: HydrationPrefetchStrategy }>
  >().branded.toEqualTypeOf<PrefetchHydrateProps>()
})

test('Hydrate requires a strategy', () => {
  expectTypeOf<{
    when: HydrationStrategy
    children: ReactNode
  }>().toMatchTypeOf<HydrateProps>()

  expectTypeOf<{
    children: ReactNode
  }>().not.toMatchTypeOf<HydrateProps>()
})

test('Hydrate requires a framework-renderable strategy', () => {
  expectTypeOf<CoreHydrationStrategy>().not.toMatchTypeOf<HydrationStrategy>()
  expectTypeOf<ReturnType<typeof visible>>().toMatchTypeOf<HydrationStrategy>()

  expectTypeOf<{
    when: CoreHydrationStrategy
    children: ReactNode
  }>().not.toMatchTypeOf<HydrateProps>()
})

test('Hydrate enforces prefetch only with split boundaries', () => {
  expectTypeOf<{
    when: HydrationStrategy
    prefetch: HydrationPrefetchStrategy
    children: ReactNode
  }>().toMatchTypeOf<HydrateProps>()

  expectTypeOf<{
    when: HydrationStrategy
    prefetch: HydrationPrefetchStrategy
    split: true
    children: ReactNode
  }>().toMatchTypeOf<HydrateProps>()

  expectTypeOf<{
    when: HydrationStrategy
    prefetch: HydrationPrefetchStrategy
    split: false
    children: ReactNode
  }>().not.toMatchTypeOf<HydrateProps>()
})
