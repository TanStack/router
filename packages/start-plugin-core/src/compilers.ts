import * as babel from '@babel/core'
import * as t from '@babel/types'
import { codeFrameColumns } from '@babel/code-frame'
import type { ParseAstOptions } from '@tanstack/router-utils'

// build these once and reuse them
export const handleServerOnlyCallExpression =
  buildEnvOnlyCallExpressionHandler('server')
export const handleClientOnlyCallExpression =
  buildEnvOnlyCallExpressionHandler('client')

export type CompileOptions = ParseAstOptions & {
  env: 'server' | 'client' | 'ssr'
  dce?: boolean
  filename: string
}

export type IdentifierConfig = {
  name: string
  handleCallExpression: (
    path: babel.NodePath<t.CallExpression>,
    opts: CompileOptions,
  ) => void
  paths: Array<babel.NodePath>
}



export function handleCreateServerFnCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: CompileOptions,
) {
  // The function is the 'fn' property of the object passed to createServerFn

  // const firstArg = path.node.arguments[0]
  // if (t.isObjectExpression(firstArg)) {
  //   // Was called with some options
  // }

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
    if (opts.env === 'client' || opts.env === 'ssr') {
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

export function handleCreateMiddlewareCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: CompileOptions,
) {
  const rootCallExpression = getRootCallExpression(path)

  // if (debug)
  //   console.info(
  //     'Handling createMiddleware call expression:',
  //     rootCallExpression.toString(),
  //   )

  const callExpressionPaths = {
    middleware: null as babel.NodePath<t.CallExpression> | null,
    validator: null as babel.NodePath<t.CallExpression> | null,
    client: null as babel.NodePath<t.CallExpression> | null,
    server: null as babel.NodePath<t.CallExpression> | null,
  }

  const validMethods = Object.keys(callExpressionPaths)

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
        'createMiddleware().validator() must be called with a validator!',
      )
    }

    // If we're on the client or ssr, remove the validator call expression
    if (opts.env === 'client' || opts.env === 'ssr') {
      if (t.isMemberExpression(callExpressionPaths.validator.node.callee)) {
        callExpressionPaths.validator.replaceWith(
          callExpressionPaths.validator.node.callee.object,
        )
      }
    }
  }

  const serverFnPath = callExpressionPaths.server?.get(
    'arguments.0',
  ) as babel.NodePath<any>

  if (
    callExpressionPaths.server &&
    serverFnPath.node &&
    (opts.env === 'client' || opts.env === 'ssr')
  ) {
    // If we're on the client, remove the server call expression
    if (t.isMemberExpression(callExpressionPaths.server.node.callee)) {
      callExpressionPaths.server.replaceWith(
        callExpressionPaths.server.node.callee.object,
      )
    }
  }
}

function buildEnvOnlyCallExpressionHandler(env: 'client' | 'server') {
  return function envOnlyCallExpressionHandler(
    path: babel.NodePath<t.CallExpression>,
    opts: CompileOptions,
  ) {
    // if (debug)
    //   console.info(`Handling ${env}Only call expression:`, path.toString())

    const isEnvMatch =
      env === 'client'
        ? opts.env === 'client'
        : opts.env === 'server' || opts.env === 'ssr'

    if (isEnvMatch) {
      // extract the inner function from the call expression
      const innerInputExpression = path.node.arguments[0]

      if (!t.isExpression(innerInputExpression)) {
        throw new Error(
          `${env}Only() functions must be called with a function!`,
        )
      }

      path.replaceWith(innerInputExpression)
      return
    }

    // If we're on the wrong environment, replace the call expression
    // with a function that always throws an error.
    path.replaceWith(
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.throwStatement(
            t.newExpression(t.identifier('Error'), [
              t.stringLiteral(
                `${env}Only() functions can only be called on the ${env}!`,
              ),
            ]),
          ),
        ]),
      ),
    )
  }
}

export function handleCreateIsomorphicFnCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: CompileOptions,
) {
  const rootCallExpression = getRootCallExpression(path)

  // if (debug)
  //   console.info(
  //     'Handling createIsomorphicFn call expression:',
  //     rootCallExpression.toString(),
  //   )

  const callExpressionPaths = {
    client: null as babel.NodePath<t.CallExpression> | null,
    server: null as babel.NodePath<t.CallExpression> | null,
  }

  const validMethods = Object.keys(callExpressionPaths)

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

  if (
    validMethods.every(
      (method) =>
        !callExpressionPaths[method as keyof typeof callExpressionPaths],
    )
  ) {
    const variableId = rootCallExpression.parentPath.isVariableDeclarator()
      ? rootCallExpression.parentPath.node.id
      : null
    console.warn(
      'createIsomorphicFn called without a client or server implementation!',
      'This will result in a no-op function.',
      'Variable name:',
      t.isIdentifier(variableId) ? variableId.name : 'unknown',
    )
  }

  const resolvedEnv = opts.env === 'ssr' ? 'server' : opts.env

  const envCallExpression = callExpressionPaths[resolvedEnv]

  if (!envCallExpression) {
    // if we don't have an implementation for this environment, default to a no-op
    rootCallExpression.replaceWith(
      t.arrowFunctionExpression([], t.blockStatement([])),
    )
    return
  }

  const innerInputExpression = envCallExpression.node.arguments[0]

  if (!t.isExpression(innerInputExpression)) {
    throw new Error(
      `createIsomorphicFn().${resolvedEnv}(func) must be called with a function!`,
    )
  }

  rootCallExpression.replaceWith(innerInputExpression)
}

export function getRootCallExpression(path: babel.NodePath<t.CallExpression>) {
  // Find the highest callExpression parent
  let rootCallExpression: babel.NodePath<t.CallExpression> = path

  // Traverse up the chain of CallExpressions
  while (rootCallExpression.parentPath.isMemberExpression()) {
    const parent = rootCallExpression.parentPath
    if (parent.parentPath.isCallExpression()) {
      rootCallExpression = parent.parentPath
    }
  }

  return rootCallExpression
}

function codeFrameError(
  code: string,
  loc: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  },
  message: string,
) {
  const frame = codeFrameColumns(
    code,
    {
      start: loc.start,
      end: loc.end,
    },
    {
      highlightCode: true,
      message,
    },
  )

  return new Error(frame)
}
