import * as createRoutePropertyOrder from './rules/create-route-property-order/create-route-property-order.rule'
import * as noLifecycleCodecParamAnnotations from './rules/no-lifecycle-codec-param-annotations/no-lifecycle-codec-param-annotations.rule'
import * as routeParamNames from './rules/route-param-names/route-param-names.rule'
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
  [noLifecycleCodecParamAnnotations.name]:
    noLifecycleCodecParamAnnotations.rule,
  [routeParamNames.name]: routeParamNames.rule,
}
