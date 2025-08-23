import * as t from '@babel/types'
import { codeFrameError, getRootCallExpression } from './utils'
import type * as babel from '@babel/core'

import type { CompileOptions } from './compilers'

export function handleCreateServerFnCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: CompileOptions,
) {
  // Traverse the member expression and find the call expressions for
  // the validator, handler, and middleware methods. Check to make sure they
  // are children of the createServerFn call expression.

  const calledOptions = path.node.arguments[0]
    ? (path.get('arguments.0') as babel.NodePath<t.ObjectExpression>)
    : null

  const shouldValidateClient = !!calledOptions?.node.properties.find((prop) => {
    return (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      prop.key.name === 'validateClient' &&
      t.isBooleanLiteral(prop.value) &&
      prop.value.value === true
    )
  })

  const callExpressionPaths = {
    middleware: null as babel.NodePath<t.CallExpression> | null,
    validator: null as babel.NodePath<t.CallExpression> | null,
    handler: null as babel.NodePath<t.CallExpression> | null,
  }

  const validMethods = Object.keys(callExpressionPaths)

  const rootCallExpression = getRootCallExpression(path)

  // if (debug)
  //   console.info(
  //     'Handling createServerFn call expression:',
  //     rootCallExpression.toString(),
  //   )

  // Check if the call is assigned to a variable
  if (!rootCallExpression.parentPath.isVariableDeclarator()) {
    throw new Error('createServerFn must be assigned to a variable!')
  }

  // Get the identifier name of the variable
  const variableDeclarator = rootCallExpression.parentPath.node
  const existingVariableName = (variableDeclarator.id as t.Identifier).name

  rootCallExpression.traverse({
    MemberExpression(memberExpressionPath) {
      if (t.isIdentifier(memberExpressionPath.node.property)) {
        const name = memberExpressionPath.node.property
          .name as keyof typeof callExpressionPaths

        if (
          validMethods.includes(name) &&
          memberExpressionPath.parentPath.isCallExpression()
        ) {
          callExpressionPaths[name] = memberExpressionPath.parentPath
        }
      }
    },
  })

  if (callExpressionPaths.validator) {
    const innerInputExpression = callExpressionPaths.validator.node.arguments[0]

    if (!innerInputExpression) {
      throw new Error(
        'createServerFn().validator() must be called with a validator!',
      )
    }

    // If we're on the client, and we're not validating the client, remove the validator call expression
    if (
      opts.env === 'client' &&
      !shouldValidateClient &&
      t.isMemberExpression(callExpressionPaths.validator.node.callee)
    ) {
      callExpressionPaths.validator.replaceWith(
        callExpressionPaths.validator.node.callee.object,
      )
    }
  }

  // First, we need to move the handler function to a nested function call
  // that is applied to the arguments passed to the server function.

  const handlerFnPath = callExpressionPaths.handler?.get(
    'arguments.0',
  ) as babel.NodePath<any>

  if (!callExpressionPaths.handler || !handlerFnPath.node) {
    throw codeFrameError(
      opts.code,
      path.node.callee.loc!,
      `createServerFn must be called with a "handler" property!`,
    )
  }

  const handlerFn = handlerFnPath.node

  // So, the way we do this is we give the handler function a way
  // to access the serverFn ctx on the server via function scope.
  // The 'use server' extracted function will be called with the
  // payload from the client, then use the scoped serverFn ctx
  // to execute the handler function.
  // This way, we can do things like data and middleware validation
  // in the __execute function without having to AST transform the
  // handler function too much itself.

  // .handler((optsOut, ctx) => {
  //   return ((optsIn) => {
  //     'use server'
  //     ctx.__execute(handlerFn, optsIn)
  //   })(optsOut)
  // })

  // If the handler function is an identifier and we're on the client, we need to
  // remove the bound function from the file.
  // If we're on the server, you can leave it, since it will get referenced
  // as a second argument.

  if (t.isIdentifier(handlerFn)) {
    if (opts.env === 'client') {
      // Find the binding for the handler function
      const binding = handlerFnPath.scope.getBinding(handlerFn.name)
      // Remove it
      if (binding) {
        binding.path.remove()
      }
    }
    // If the env is server, just leave it alone
  }

  handlerFnPath.replaceWith(
    t.arrowFunctionExpression(
      [t.identifier('opts'), t.identifier('signal')],
      t.blockStatement(
        // Everything in here is server-only, since the client
        // will strip out anything in the 'use server' directive.
        [
          t.returnStatement(
            t.callExpression(
              t.identifier(`${existingVariableName}.__executeServer`),
              [t.identifier('opts'), t.identifier('signal')],
            ),
          ),
        ],
        [t.directive(t.directiveLiteral('use server'))],
      ),
    ),
  )

  if (opts.env === 'server') {
    callExpressionPaths.handler.node.arguments.push(handlerFn)
  }
}
