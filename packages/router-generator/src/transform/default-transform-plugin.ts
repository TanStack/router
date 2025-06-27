import { types } from 'recast'
import { ensureStringArgument } from './utils'
import type { TransformImportsConfig, TransformPlugin } from './types'

const b = types.builders

const EXPORT_NAME = 'Route'
export const defaultTransformPlugin: TransformPlugin = {
  name: 'default-transform',
  exportName: EXPORT_NAME,
  imports: (ctx) => {
    const imports: TransformImportsConfig = {}
    const targetModule = `@tanstack/${ctx.target}-router`
    if (ctx.verboseFileRoutes === false) {
      imports.banned = [
        {
          source: targetModule,
          specifiers: [
            { imported: 'createLazyFileRoute' },
            { imported: 'createFileRoute' },
          ],
        },
      ]
    } else {
      if (ctx.lazy) {
        imports.required = [
          {
            source: targetModule,
            specifiers: [{ imported: 'createLazyFileRoute' }],
          },
        ]
        imports.banned = [
          {
            source: targetModule,
            specifiers: [{ imported: 'createFileRoute' }],
          },
        ]
      } else {
        imports.required = [
          {
            source: targetModule,
            specifiers: [{ imported: 'createFileRoute' }],
          },
        ]
        imports.banned = [
          {
            source: targetModule,
            specifiers: [{ imported: 'createLazyFileRoute' }],
          },
        ]
      }
    }
    return imports
  },
  onExportFound: ({ decl, ctx }) => {
    let appliedChanges = false
    if (decl.init?.type === 'CallExpression') {
      const callExpression = decl.init
      let identifier: types.namedTypes.Identifier | undefined
      // `const Route = createFileRoute({ ... })`
      if (callExpression.callee.type === 'Identifier') {
        identifier = callExpression.callee
        if (ctx.verboseFileRoutes) {
          // we need to add the string literal via another CallExpression
          callExpression.callee = b.callExpression(identifier, [
            b.stringLiteral(ctx.routeId),
          ])
          appliedChanges = true
        }
      }
      // `const Route = createFileRoute('/path')({ ... })`
      else if (
        callExpression.callee.type === 'CallExpression' &&
        callExpression.callee.callee.type === 'Identifier'
      ) {
        identifier = callExpression.callee.callee
        if (!ctx.verboseFileRoutes) {
          // we need to remove the route id
          callExpression.callee = identifier
          appliedChanges = true
        } else {
          // check if the route id is correct
          appliedChanges = ensureStringArgument(
            callExpression.callee,
            ctx.routeId,
            ctx.preferredQuote,
          )
        }
      }
      if (identifier === undefined) {
        throw new Error(
          `expected identifier to be present in ${ctx.routeId} for export ${EXPORT_NAME}`,
        )
      }
      if (identifier.name === 'createFileRoute' && ctx.lazy) {
        identifier.name = 'createLazyFileRoute'
        appliedChanges = true
      } else if (identifier.name === 'createLazyFileRoute' && !ctx.lazy) {
        identifier.name = 'createFileRoute'
        appliedChanges = true
      }
    }

    return appliedChanges
  },
}
