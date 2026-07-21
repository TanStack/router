import { describe, expectTypeOf, test } from 'vitest'
import type {
  AnyRouter,
  BackOptions,
  BuildLocationFn,
  NavigateOptionProps,
  NativeNavigateOptions,
  StackBehavior,
  StackMatch,
} from '../src'

describe('native stack navigation types', () => {
  test('navigation metadata is renderer independent', () => {
    expectTypeOf<StackBehavior>().toEqualTypeOf<
      'auto' | 'push' | 'replace' | 'reuse'
    >()
    expectTypeOf<StackMatch>().toEqualTypeOf<'nearest' | 'oldest'>()
    expectTypeOf<NativeNavigateOptions>().toEqualTypeOf<{
      minStackState?: 'active' | 'paused'
    }>()

    expectTypeOf<NavigateOptionProps>().toMatchTypeOf<{
      stackBehavior?: StackBehavior
      stackMatch?: StackMatch
      entryId?: string
      native?: NativeNavigateOptions
    }>()
  })

  test('buildLocation accepts a fully built href', () => {
    expectTypeOf<{ href: string }>().toMatchTypeOf<
      Parameters<BuildLocationFn>[0]
    >()
  })

  test('back targets are mutually exclusive', () => {
    const steps = { steps: 2 } satisfies BackOptions
    const root = { to: 'root' } satisfies BackOptions
    const route = {
      to: '/items/$itemId',
      entryId: 'item-one',
      ifMissing: 'replace',
    } satisfies BackOptions<AnyRouter, string, '/items/$itemId'>

    expectTypeOf(steps.steps).toEqualTypeOf<number>()
    expectTypeOf(root.to).toEqualTypeOf<'root'>()
    expectTypeOf(route.entryId).toEqualTypeOf<string>()

    expectTypeOf<{
      steps: number
      to: '/items/$itemId'
    }>().not.toMatchTypeOf<BackOptions<AnyRouter, string, '/items/$itemId'>>()
    expectTypeOf<{
      to: 'root'
      entryId: string
    }>().not.toMatchTypeOf<BackOptions<AnyRouter, string, 'root'>>()
  })
})
