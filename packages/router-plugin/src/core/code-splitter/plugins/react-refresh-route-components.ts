import * as t from '@babel/types'
import { getUniqueProgramIdentifier } from '../../utils'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

const REACT_REFRESH_ROUTE_COMPONENT_IDENTS = new Set([
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
])

export function createReactRefreshRouteComponentsPlugin(): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-refresh-route-components',
    onUnsplittableRoute(ctx) {
      if (!ctx.opts.addHmr) {
        return
      }

      const hoistedDeclarations: Array<t.VariableDeclaration> = []

      ctx.routeOptions.properties.forEach((prop) => {
        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
          return
        }

        if (!REACT_REFRESH_ROUTE_COMPONENT_IDENTS.has(prop.key.name)) {
          return
        }

        if (
          !t.isArrowFunctionExpression(prop.value) &&
          !t.isFunctionExpression(prop.value)
        ) {
          return
        }

        const hoistedIdentifier = getUniqueProgramIdentifier(
          ctx.programPath,
          `TSR${prop.key.name[0]!.toUpperCase()}${prop.key.name.slice(1)}`,
        )

        hoistedDeclarations.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              hoistedIdentifier,
              t.cloneNode(prop.value, true),
            ),
          ]),
        )

        prop.value = t.cloneNode(hoistedIdentifier)
      })

      if (hoistedDeclarations.length === 0) {
        return
      }

      ctx.insertionPath.insertBefore(hoistedDeclarations)
      return { modified: true }
    },
  }
}
