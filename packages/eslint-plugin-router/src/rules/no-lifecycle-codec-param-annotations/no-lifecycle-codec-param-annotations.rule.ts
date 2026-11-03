import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'

import { getDocsUrl } from '../../utils/get-docs-url'
import {
  getLifecycleObjects,
  getRouteOptionsCalls,
  getStaticPropertyName,
  unwrapTSExpression,
} from '../../utils/route-options'
import { inferredParamProperties } from './constants'
import type { TSESTree } from '@typescript-eslint/utils'
import type { ExtraRuleDocs } from '../../types'

const createRule = ESLintUtils.RuleCreator<ExtraRuleDocs>(getDocsUrl)

const inferredParamPropertySet = new Set<string>(inferredParamProperties)

/** The type annotation on the first parameter that receives a value, if any. */
function getValueParamAnnotation(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): TSESTree.TSTypeAnnotation | undefined {
  let param = fn.params[0]
  // `function (this: void, ctx) {}`: `this` is only typed, never passed
  if (param?.type === AST_NODE_TYPES.Identifier && param.name === 'this') {
    param = fn.params[1]
  }
  if (
    param === undefined ||
    param.type === AST_NODE_TYPES.TSParameterProperty
  ) {
    return undefined
  }
  // typescript-estree puts the annotation of a parameter with a default value
  // on its binding (`left`), never on the `AssignmentPattern` itself
  return param.type === AST_NODE_TYPES.AssignmentPattern
    ? param.left.typeAnnotation
    : param.typeAnnotation
}

export const name = 'no-lifecycle-codec-param-annotations'

export const rule = createRule({
  name,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow type annotations on the parameters of `dehydrate`, `hydrate` and `revalidate` in route lifecycle options',
      recommended: 'error',
    },
    messages: {
      annotatedParam:
        'The parameter of `{{lifecycle}}.{{property}}` is inferred and must not be annotated. Remove the type annotation; TypeScript derives it from `handler` (and from `dehydrate` for `hydrate`).',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      Program(program) {
        for (const { options } of getRouteOptionsCalls(
          context.sourceCode,
          program,
        )) {
          for (const { lifecycle, object } of getLifecycleObjects(options)) {
            for (const member of object.properties) {
              if (member.type !== AST_NODE_TYPES.Property) {
                continue
              }
              const memberName = getStaticPropertyName(member)
              if (
                memberName === null ||
                !inferredParamPropertySet.has(memberName)
              ) {
                continue
              }
              const fn = unwrapTSExpression(member.value)
              if (
                fn.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
                fn.type !== AST_NODE_TYPES.FunctionExpression
              ) {
                continue
              }
              const annotation = getValueParamAnnotation(fn)
              // a missing annotation is `undefined` in typescript-estree and
              // `null` in ASTs that write absent fields out (Oxc)
              if (!annotation) {
                continue
              }
              context.report({
                node: annotation,
                messageId: 'annotatedParam',
                data: { lifecycle, property: memberName },
              })
            }
          }
        }
      },
    }
  },
})
