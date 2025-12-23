import * as t from '@babel/types'
import { codeFrameError } from './utils'
import type { RewriteCandidate } from './types'

/**
 * Handles createServerFn transformations.
 *
 * @param candidate - The rewrite candidate containing path and method chain
 * @param opts - Options including the environment, code, directive, and provider file flag
 */
export function handleCreateServerFn(
  candidate: RewriteCandidate,
  opts: {
    env: 'client' | 'server'
    code: string
    directive: string
    /**
     * Whether this file is a provider file (extracted server function file).
     * Only provider files should have the handler implementation as a second argument.
     */
    isProviderFile: boolean
  },
) {
  const { path, methodChain } = candidate
  const { inputValidator, handler } = methodChain

  // Check if the call is assigned to a variable
  if (!path.parentPath.isVariableDeclarator()) {
    throw new Error('createServerFn must be assigned to a variable!')
  }

  // Get the identifier name of the variable
  const variableDeclarator = path.parentPath.node
  if (!t.isIdentifier(variableDeclarator.id)) {
    throw codeFrameError(
      opts.code,
      variableDeclarator.id.loc!,
      'createServerFn must be assigned to a simple identifier, not a destructuring pattern',
    )
  }
  const existingVariableName = variableDeclarator.id.name

  if (inputValidator) {
    const innerInputExpression = inputValidator.callPath.node.arguments[0]

    if (!innerInputExpression) {
      throw new Error(
        'createServerFn().inputValidator() must be called with a validator!',
      )
    }

    // If we're on the client, remove the validator call expression
    if (opts.env === 'client') {
      if (t.isMemberExpression(inputValidator.callPath.node.callee)) {
        inputValidator.callPath.replaceWith(
          inputValidator.callPath.node.callee.object,
        )
      }
    }
  }

  // First, we need to move the handler function to a nested function call
  // that is applied to the arguments passed to the server function.

  const handlerFnPath = handler?.firstArgPath

  if (!handler || !handlerFnPath?.node) {
    throw codeFrameError(
      opts.code,
      path.node.callee.loc!,
      `createServerFn must be called with a "handler" property!`,
    )
  }

  // Validate the handler argument is an expression (not a SpreadElement, etc.)
  if (!t.isExpression(handlerFnPath.node)) {
    throw codeFrameError(
      opts.code,
      handlerFnPath.node.loc!,
      `handler() must be called with an expression, not a ${handlerFnPath.node.type}`,
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
        [t.directive(t.directiveLiteral(opts.directive))],
      ),
    ),
  )

  // Add the serverFn as a second argument on the server side,
  // but ONLY for provider files (extracted server function files).
  // Caller files must NOT have the second argument because the implementation is already available in the extracted chunk
  // and including it would duplicate code
  if (opts.env === 'server' && opts.isProviderFile) {
    handler.callPath.node.arguments.push(handlerFn)
  }
}
