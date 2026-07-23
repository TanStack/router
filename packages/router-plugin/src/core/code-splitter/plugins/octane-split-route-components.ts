import * as t from '@babel/types'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

function isStaticMember(
  node: t.Node | null | undefined,
  objectName: string,
  propertyName: string,
): node is t.MemberExpression {
  return (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object, { name: objectName }) &&
    t.isIdentifier(node.property, { name: propertyName })
  )
}

function isOctaneSingleRootStamp(
  statement: t.Statement,
  componentName: string,
) {
  if (!t.isExpressionStatement(statement)) {
    return false
  }

  const expression = statement.expression
  return (
    t.isAssignmentExpression(expression, { operator: '=' }) &&
    isStaticMember(expression.left, componentName, '$$singleRoot') &&
    t.isBooleanLiteral(expression.right, { value: true })
  )
}

function isOctaneWarmPlan(statement: t.Statement, componentName: string) {
  if (!t.isExpressionStatement(statement)) {
    return false
  }

  const expression = statement.expression
  return (
    t.isAssignmentExpression(expression, { operator: '=' }) &&
    isStaticMember(expression.left, componentName, '__warm') &&
    t.isArrowFunctionExpression(expression.right) &&
    !expression.right.async &&
    expression.right.params.length === 1 &&
    t.isIdentifier(expression.right.params[0], { name: '__wp' })
  )
}

function isOctaneLocationStamp(statement: t.Statement, componentName: string) {
  if (
    !t.isTryStatement(statement) ||
    statement.finalizer ||
    !statement.handler ||
    statement.handler.param ||
    statement.block.body.length !== 1 ||
    statement.handler.body.body.length !== 0 ||
    !statement.handler.body.innerComments?.some(
      (comment) => comment.value.trim() === 'frozen component',
    )
  ) {
    return false
  }

  const [bodyStatement] = statement.block.body
  if (!t.isExpressionStatement(bodyStatement)) {
    return false
  }

  const expression = bodyStatement.expression
  if (
    !t.isAssignmentExpression(expression, { operator: '=' }) ||
    !isStaticMember(expression.left, componentName, '__oct_loc')
  ) {
    return false
  }

  return (
    (t.isStringLiteral(expression.right) &&
      /:\d+:\d+$/.test(expression.right.value)) ||
    (t.isMemberExpression(expression.right) &&
      !expression.right.computed &&
      t.isIdentifier(expression.right.property, { name: '__oct_loc' }))
  )
}

function isOctaneCompilerCompanion(
  statement: t.Statement,
  componentName: string,
) {
  return (
    isOctaneSingleRootStamp(statement, componentName) ||
    isOctaneWarmPlan(statement, componentName) ||
    isOctaneLocationStamp(statement, componentName)
  )
}

/**
 * Octane emits component metadata as adjacent top-level statements. Once the
 * component binding moves to a virtual route module, those statements must
 * move with it instead of evaluating against a missing binding in the
 * reference module.
 */
export function createOctaneSplitRouteComponentsPlugin(): ReferenceRouteCompilerPlugin {
  return {
    name: 'octane-split-route-components',
    onSplitRouteProperty(ctx) {
      if (!t.isIdentifier(ctx.prop.value)) {
        return
      }

      const componentName = ctx.prop.value.name
      for (const statementPath of ctx.programPath.get('body')) {
        if (isOctaneCompilerCompanion(statementPath.node, componentName)) {
          statementPath.remove()
        }
      }
    },
  }
}
