import { b } from 'yuku-ast'
import {
  moduleDeclarationGraph,
  unwrapExpression,
} from '@tanstack/router-utils'
import {
  getObjectPropertyKeyName,
  getUniqueProgramIdentifier,
} from '../../utils'
import type { ObjectProperty, VariableDeclaration } from '@yuku-toolchain/types'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

const REACT_REFRESH_ROUTE_COMPONENT_IDENTS = new Set([
  'component',
  'shellComponent',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
])

type RouteComponentContext = Parameters<
  NonNullable<ReferenceRouteCompilerPlugin['onAddHmr']>
>[0]

function isReactComponentName(name: string) {
  const firstCharacter = name[0]

  return (
    firstCharacter !== undefined &&
    firstCharacter >= 'A' &&
    firstCharacter <= 'Z'
  )
}

function getRouteComponentKey(prop: ObjectProperty) {
  const key = getObjectPropertyKeyName(prop)

  return key && REACT_REFRESH_ROUTE_COMPONENT_IDENTS.has(key) ? key : undefined
}

function prepareRouteComponentsForReactRefresh(ctx: RouteComponentContext) {
  const hoistedDeclarations: Array<VariableDeclaration> = []
  let modified = false

  for (const prop of ctx.routeOptions.properties) {
    if (prop.type !== 'Property' || prop.method || prop.kind !== 'init') {
      continue
    }

    const key = getRouteComponentKey(prop)

    if (!key) {
      continue
    }

    prop.value = unwrapExpression(prop.value)

    if (prop.value.type === 'Identifier') {
      if (isReactComponentName(prop.value.name)) {
        continue
      }

      const original = ctx.originalNodes.get(prop.value)
      const symbol = original ? ctx.module.symbolOf(original) : null
      if (symbol && ctx.opts.sharedBindings?.has(symbol.name)) {
        continue
      }
      const bindingNode = symbol
        ? moduleDeclarationGraph(ctx.module).declarations.get(symbol)
        : undefined
      const isLocalComponentBinding =
        bindingNode?.type === 'FunctionDeclaration' ||
        bindingNode?.type === 'ClassDeclaration' ||
        bindingNode?.type === 'VariableDeclarator'

      if (!isLocalComponentBinding) {
        continue
      }

      const componentIdentifier = getUniqueProgramIdentifier(
        ctx.program,
        `TSR${key[0]!.toUpperCase()}${key.slice(1)}`,
      )

      ctx.renameBinding(prop.value, componentIdentifier.name)
      modified = true
      continue
    }

    if (
      prop.value.type !== 'ArrowFunctionExpression' &&
      prop.value.type !== 'FunctionExpression'
    ) {
      continue
    }

    const hoistedIdentifier = getUniqueProgramIdentifier(
      ctx.program,
      `TSR${key[0]!.toUpperCase()}${key.slice(1)}`,
    )

    hoistedDeclarations.push(
      b.VariableDeclaration({
        kind: 'const',
        declarations: [
          b.VariableDeclarator({ id: hoistedIdentifier, init: prop.value }),
        ],
      }),
    )

    prop.value = b.Identifier({ name: hoistedIdentifier.name })
    modified = true
  }

  if (hoistedDeclarations.length > 0) {
    ctx.insertBefore(hoistedDeclarations)
  }

  return modified
}

export function createReactRefreshRouteComponentsPlugin(): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-refresh-route-components',
    getStableRouteOptionKeys() {
      return [...REACT_REFRESH_ROUTE_COMPONENT_IDENTS]
    },
    onAddHmr(ctx) {
      if (prepareRouteComponentsForReactRefresh(ctx)) {
        return { modified: true }
      }

      return
    },
    onVirtualRouteSplitNode(ctx) {
      if (
        ctx.splitNodeMeta.splitStrategy !== 'lazyRouteComponent' ||
        ctx.splitNode.type !== 'FunctionDeclaration' ||
        !ctx.splitNode.id ||
        isReactComponentName(ctx.splitNode.id.name)
      ) {
        return
      }

      const componentIdentifier = getUniqueProgramIdentifier(
        ctx.program,
        ctx.splitNodeMeta.localExporterIdent,
      )

      ctx.renameBinding(ctx.splitNode.id, componentIdentifier.name)
    },
  }
}
