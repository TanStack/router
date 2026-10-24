import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'

import { getDocsUrl } from '../../utils/get-docs-url'
import {
  getLifecycleObjects,
  getRouteOptionsCalls,
  getStaticPropertyName,
} from '../../utils/route-options'
import { sortDataByOrder } from './create-route-property-order.utils'
import {
  lifecycleExpectedOrder,
  lifecycleSortRules,
  sortRules,
} from './constants'
import type { OrderRules } from './constants'
import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import type { ExtraRuleDocs } from '../../types'

const createRule = ESLintUtils.RuleCreator<ExtraRuleDocs>(getDocsUrl)

export const name = 'create-route-property-order'

/**
 * Returns the members of `object` in the order the rules require, or `null`
 * when nothing has to move. Members the rules do not name (unknown keys,
 * computed keys, spreads) keep their slot; `sortDataByOrder` only permutes the
 * members that appear in the rules.
 */
function getSortedProperties(
  object: TSESTree.ObjectExpression,
  rules: OrderRules,
): Array<TSESTree.ObjectLiteralElement> | null {
  // no need to sort if there is at max 1 property
  if (object.properties.length < 2) {
    return null
  }
  const sorted = sortDataByOrder(
    object.properties.map((property) => ({
      name: getStaticPropertyName(property),
      property,
    })),
    rules,
    'name',
  )
  return sorted?.map(({ property }) => property) ?? null
}

/** A member a key must not cross: it can set any key at runtime. */
function isSpreadOrComputed(property: TSESTree.ObjectLiteralElement): boolean {
  return property.type === AST_NODE_TYPES.SpreadElement || property.computed
}

/**
 * Rewrites the member list of `object` in `sorted` order, or returns `null`
 * when that rewrite could change what the code means:
 *
 * - A key that moves across a spread or a computed key can change which value
 *   wins: in `{ a: 1, ...rest }` the spread overrides `a`, in
 *   `{ ...rest, a: 1 }` it does not.
 * - Only the member texts move; the text between two members (commas,
 *   whitespace, comments) stays where it is. A comment belongs to the member
 *   below it, and one that starts on the line a member ends on also to that
 *   member (a next-line directive written there acts on the member below). A
 *   comment that belongs to a member from the first to the last slot that
 *   changes would end up on another member, and a range `eslint-disable`
 *   comment there would cover other members. Comments inside a member move
 *   with the member.
 */
function getOrderFix(
  sourceCode: Readonly<TSESLint.SourceCode>,
  object: TSESTree.ObjectExpression,
  sorted: Array<TSESTree.ObjectLiteralElement>,
): TSESLint.ReportFixFunction | null {
  const properties = object.properties
  const crossesSpreadOrComputed = sorted.some((property, index) => {
    const from = properties.indexOf(property)
    return properties
      .slice(Math.min(from, index), Math.max(from, index))
      .some(isSpreadOrComputed)
  })
  if (crossesSpreadOrComputed) {
    return null
  }
  const changed = sorted.flatMap((property, index) =>
    property === properties[index] ? [] : [index],
  )
  const first = changed[0]!
  const last = changed.at(-1)!
  const movesComment = sourceCode.getCommentsInside(object).some((comment) => {
    // the comment sits in the gap before `next`, or inside the member before it
    let next = properties.findIndex(
      (property) => comment.range[1] <= property.range[0],
    )
    if (next === -1) {
      next = properties.length
    }
    const previous = properties[next - 1]
    if (previous !== undefined && comment.range[0] < previous.range[1]) {
      return false
    }
    const owner =
      previous !== undefined && comment.loc.start.line === previous.loc.end.line
        ? next - 1
        : next
    return owner <= last && next >= first
  })
  if (movesComment) {
    return null
  }
  return (fixer) => {
    const start = properties[0]!.range[0]
    let end = start
    let text = ''
    for (let index = 0; index < properties.length; index++) {
      const slot = properties[index]!
      // the text between two slots stays, the slot gets its sorted member
      text +=
        sourceCode.text.slice(end, slot.range[0]) +
        sourceCode.getText(sorted[index])
      end = slot.range[1]
    }
    return fixer.replaceTextRange([start, end], text)
  }
}

export const rule = createRule({
  name,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure correct order of inference sensitive properties for createRoute functions',
      recommended: 'error',
    },
    messages: {
      invalidOrder: 'Invalid order of properties for `{{function}}`.',
      invalidLifecycleOrder:
        'Invalid order of properties for `{{property}}` in `{{function}}`. Expected order: {{expected}}.',
    },
    schema: [],
    hasSuggestions: true,
    fixable: 'code',
  },
  defaultOptions: [],

  create(context) {
    const sourceCode = context.sourceCode
    return {
      Program(program) {
        for (const { factory, options } of getRouteOptionsCalls(
          sourceCode,
          program,
        )) {
          const sorted = getSortedProperties(options, sortRules)
          if (sorted !== null) {
            context.report({
              node: options,
              data: { function: factory },
              messageId: 'invalidOrder',
              fix: getOrderFix(sourceCode, options, sorted),
            })
          }

          for (const { lifecycle, object } of getLifecycleObjects(options)) {
            const sortedLifecycle = getSortedProperties(
              object,
              lifecycleSortRules[lifecycle],
            )
            if (sortedLifecycle === null) {
              continue
            }
            context.report({
              node: object,
              data: {
                function: factory,
                property: lifecycle,
                expected: lifecycleExpectedOrder[lifecycle],
              },
              messageId: 'invalidLifecycleOrder',
              fix: getOrderFix(sourceCode, object, sortedLifecycle),
            })
          }
        }
      },
    }
  },
})
