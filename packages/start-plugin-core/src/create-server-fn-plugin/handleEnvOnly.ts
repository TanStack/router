import * as t from '@babel/types'
import type { RewriteCandidate } from './types'
import type { LookupKind } from './compiler'

function capitalize(str: string) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function handleEnvOnlyFn(
  candidate: RewriteCandidate,
  opts: { env: 'client' | 'server'; kind: LookupKind },
) {
  const { path } = candidate
  const targetEnv = opts.kind === 'ClientOnlyFn' ? 'client' : 'server'

  if (opts.env === targetEnv) {
    // Matching environment - extract the inner function
    const innerFn = path.node.arguments[0]

    if (!t.isExpression(innerFn)) {
      throw new Error(
        `create${capitalize(targetEnv)}OnlyFn() must be called with a function!`,
      )
    }

    path.replaceWith(innerFn)
  } else {
    // Wrong environment - replace with a function that throws an error
    path.replaceWith(
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.throwStatement(
            t.newExpression(t.identifier('Error'), [
              t.stringLiteral(
                `create${capitalize(targetEnv)}OnlyFn() functions can only be called on the ${targetEnv}!`,
              ),
            ]),
          ),
        ]),
      ),
    )
  }
}
