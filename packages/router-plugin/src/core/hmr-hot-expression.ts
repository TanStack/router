import * as template from '@babel/template'
import type * as t from '@babel/types'
import type { Config } from './config'

export const DEFAULT_HMR_HOT_EXPRESSION = 'import.meta.hot'

export function resolveHmrHotExpression(hotExpression?: string): string {
  return hotExpression ?? DEFAULT_HMR_HOT_EXPRESSION
}

export function createHmrHotExpressionAst(
  hotExpression?: string,
): t.Expression {
  return template.expression.ast(resolveHmrHotExpression(hotExpression))
}

export function withHmrHotExpression(
  config: Partial<Config> | undefined,
  hotExpression: string,
): Partial<Config> {
  return {
    ...config,
    plugin: {
      ...config?.plugin,
      hmr: {
        ...config?.plugin?.hmr,
        hotExpression: config?.plugin?.hmr?.hotExpression ?? hotExpression,
      },
    },
  }
}
