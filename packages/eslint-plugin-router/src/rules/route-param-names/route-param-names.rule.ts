import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'

import { getDocsUrl } from '../../utils/get-docs-url'
import { detectTanstackRouterImports } from '../../utils/detect-router-imports'
import { filePathToRoutePath, getInvalidParams } from './route-param-names.utils'
import {
  pathAsFirstArgFunctions,
  pathAsPropertyFunctions,
  pathFromFileNameFunctions,
} from './constants'
import type { TSESTree } from '@typescript-eslint/utils'
import type { ExtraRuleDocs } from '../../types'

const createRule = ESLintUtils.RuleCreator<ExtraRuleDocs>(getDocsUrl)

const pathAsFirstArgSet = new Set<string>(pathAsFirstArgFunctions)
const pathAsPropertySet = new Set<string>(pathAsPropertyFunctions)
const pathFromFileNameSet = new Set<string>(pathFromFileNameFunctions)

export const name = 'route-param-names'

export const rule = createRule({
  name,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure route param names are valid JavaScript identifiers',
      recommended: 'error',
    },
    messages: {
      invalidParamName:
        'Invalid param name "{{paramName}}" in route path. Param names must be valid JavaScript identifiers (match /[a-zA-Z_$][a-zA-Z0-9_$]*/).',
    },
    schema: [],
  },
  defaultOptions: [],

  create: detectTanstackRouterImports((context, _, helpers) => {
    function reportInvalidParams(
      node: TSESTree.Node,
      path: string,
    ) {
      const invalidParams = getInvalidParams(path)

      for (const param of invalidParams) {
        context.report({
          node,
          messageId: 'invalidParamName',
          data: { paramName: param.paramName },
        })
      }
    }

    function getStringLiteralValue(
      node: TSESTree.Node,
    ): string | null {
      if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
        return node.value
      }
      if (
        node.type === AST_NODE_TYPES.TemplateLiteral &&
        node.quasis.length === 1 &&
        node.quasis[0]?.value.cooked
      ) {
        return node.quasis[0].value.cooked
      }
      return null
    }

    return {
      CallExpression(node) {
        // Handle direct function call: createRoute({ path: '...' })
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          const funcName = node.callee.name

          // Skip if not imported from TanStack Router
          if (!helpers.isTanstackRouterImport(node.callee)) {
            return
          }

          // Case: createRoute({ path: '/path/$param' })
          if (pathAsPropertySet.has(funcName)) {
            const arg = node.arguments[0]
            if (arg?.type === AST_NODE_TYPES.ObjectExpression) {
              for (const prop of arg.properties) {
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'path'
                ) {
                  const pathValue = getStringLiteralValue(prop.value)
                  if (pathValue) {
                    reportInvalidParams(prop.value, pathValue)
                  }
                }
              }
            }
            return
          }

          // Case: createFileRoute({ ... }) - path from file name
          if (pathFromFileNameSet.has(funcName)) {
            const arg = node.arguments[0]
            // If first argument is an object (not a string), derive path from file name
            if (arg?.type === AST_NODE_TYPES.ObjectExpression) {
              const filePath = context.filename
              const routePath = filePathToRoutePath(filePath)
              if (routePath) {
                const invalidParams = getInvalidParams(routePath)
                for (const param of invalidParams) {
                  context.report({
                    node: node.callee,
                    messageId: 'invalidParamName',
                    data: { paramName: param.paramName },
                  })
                }
              }
            }
            return
          }
        }

        // Handle curried function call: createFileRoute('/path')({ ... })
        if (node.callee.type === AST_NODE_TYPES.CallExpression) {
          const innerCall = node.callee

          if (innerCall.callee.type === AST_NODE_TYPES.Identifier) {
            const funcName = innerCall.callee.name

            // Skip if not imported from TanStack Router
            if (!helpers.isTanstackRouterImport(innerCall.callee)) {
              return
            }

            // Case: createFileRoute('/path/$param')(...) or similar
            if (pathAsFirstArgSet.has(funcName)) {
              const pathArg = innerCall.arguments[0]
              if (pathArg) {
                const pathValue = getStringLiteralValue(pathArg)
                if (pathValue) {
                  reportInvalidParams(pathArg, pathValue)
                }
              }
            }
          }
        }
      },
    }
  }),
})
