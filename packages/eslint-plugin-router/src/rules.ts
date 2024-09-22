import * as createRoutePropertyOrder from './rules/create-route-property-order/create-route-property-order.rule'
import type { ESLintUtils } from '@typescript-eslint/utils'
import type { ExtraRuleDocs } from './types'

export const rules: Record<
  string,
  ESLintUtils.RuleModule<
    string,
    ReadonlyArray<unknown>,
    ExtraRuleDocs,
    ESLintUtils.RuleListener
  >
> = {
  [createRoutePropertyOrder.name]: createRoutePropertyOrder.rule,
}
