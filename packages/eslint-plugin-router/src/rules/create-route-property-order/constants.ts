import { getCheckedProperties } from './create-route-property-order.utils'
import type { LifecycleProperty } from '../../utils/route-options'

export const sortRules = [
  [['params', 'validateSearch'], ['search']],
  [['search'], ['loaderDeps', 'ssr']],
  [['loaderDeps'], ['context']],
  [['context'], ['beforeLoad']],
  [['beforeLoad'], ['loader']],
  [
    ['loader'],
    [
      'onEnter',
      'onStay',
      'onLeave',
      'head',
      'scripts',
      'headers',
      'remountDeps',
    ],
  ],
] as const

export type CheckedProperties = (typeof sortRules)[number][number][number]
export const checkedProperties = getCheckedProperties(sortRules)

export type OrderRules = ReadonlyArray<
  Readonly<[ReadonlyArray<string>, ReadonlyArray<string>]>
>

/**
 * Key order inside the lifecycle object form, per lifecycle: `handler` first
 * (the codec parameters are inferred from it), then `dehydrate` (the wire type
 * is inferred from it), then `hydrate`, then the key only that lifecycle has
 * (`revalidate` on `context`, `staleReloadMode` on `loader`; `beforeLoad` has
 * none). A key another lifecycle owns is not in its table, so the rule never
 * moves it; the types reject it.
 */
const codecSortRules = [
  [['handler'], ['dehydrate']],
  [['dehydrate'], ['hydrate']],
] as const

export const lifecycleSortRules = {
  context: [...codecSortRules, [['hydrate'], ['revalidate']]],
  beforeLoad: codecSortRules,
  loader: [...codecSortRules, [['hydrate'], ['staleReloadMode']]],
} as const satisfies Record<LifecycleProperty, OrderRules>

function describeOrder(rules: OrderRules): string {
  return getCheckedProperties(rules)
    .map((key) => `\`${key}\``)
    .join(', ')
}

/** The expected key order per lifecycle, for the report message. */
export const lifecycleExpectedOrder: Record<LifecycleProperty, string> = {
  context: describeOrder(lifecycleSortRules.context),
  beforeLoad: describeOrder(lifecycleSortRules.beforeLoad),
  loader: describeOrder(lifecycleSortRules.loader),
}
