import path from 'node:path'
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'

import { getDocsUrl } from '../../utils/get-docs-url'
import {
  rootRouteConstructors,
  scopedRouterApis,
  scopedStartApis,
} from './constants'
import {
  getRouteModule,
  getUsedModule,
  isGeneratedFile,
} from './route-module-imports.utils'
import type { TSESTree } from '@typescript-eslint/utils'
import type { ExtraRuleDocs } from '../../types'

const createRule = ESLintUtils.RuleCreator<ExtraRuleDocs>(getDocsUrl)

const routerPackage = /^@tanstack\/(react|solid|vue)-router$/
const startPackage = /^@tanstack\/(react|solid|vue)-start$/
const scopedRouterApiSet = new Set<string>(scopedRouterApis)
const rootRouteConstructorSet = new Set<string>(rootRouteConstructors)
const scopedStartApiSet = new Set<string>(scopedStartApis)

export const name = 'route-module-imports'

export const rule = createRule({
  name,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure route modules import routing and Start APIs from their generated route scope and do not import from the modules they use',
      recommended: 'error',
    },
    messages: {
      useRouteScope:
        '"{{name}}" in a route module must be imported from its generated route scope (routeScope.gen), which types it against the module\'s own routes.',
      useModuleRoot:
        'The root route of a route module is created with "createModuleRoot" from its generated route scope (routeScope.gen), not with "{{name}}".',
      noUsedModuleImport:
        'A route module must not import from a module it uses ("{{module}}"), in values or in types: its declaration build compiles against a stand-in for that module\'s contract. Link into its routes through the generated namespace in routeScope.gen, and move shared code into a package both modules depend on.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    const filename = context.filename
    const module = isGeneratedFile(filename)
      ? null
      : getRouteModule(path.dirname(filename))
    if (!module) {
      return {}
    }

    const reportUsedModule = (node: TSESTree.Node, source: string) => {
      const used = getUsedModule(module, source)
      if (used !== undefined) {
        context.report({
          node,
          messageId: 'noUsedModuleImport',
          data: { module: used },
        })
      }
    }

    return {
      ExportNamedDeclaration(node) {
        if (node.source) {
          reportUsedModule(node, node.source.value)
        }
      },
      ExportAllDeclaration(node) {
        reportUsedModule(node, node.source.value)
      },
      ImportExpression(node) {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === 'string'
        ) {
          reportUsedModule(node, node.source.value)
        }
      },
      ImportDeclaration(node) {
        reportUsedModule(node, node.source.value)
        if (node.importKind === 'type') {
          return
        }
        const source = node.source.value
        const fromRouter = routerPackage.test(source)
        const fromStart = startPackage.test(source)
        if (!fromRouter && !fromStart) {
          return
        }
        for (const specifier of node.specifiers) {
          if (
            specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
            specifier.importKind === 'type'
          ) {
            continue
          }
          const imported =
            specifier.imported.type === AST_NODE_TYPES.Identifier
              ? specifier.imported.name
              : specifier.imported.value
          if (fromRouter && rootRouteConstructorSet.has(imported)) {
            context.report({
              node: specifier,
              messageId: 'useModuleRoot',
              data: { name: imported },
            })
          } else if (
            (fromRouter && scopedRouterApiSet.has(imported)) ||
            (fromStart && scopedStartApiSet.has(imported))
          ) {
            context.report({
              node: specifier,
              messageId: 'useRouteScope',
              data: { name: imported },
            })
          }
        }
      },
    }
  },
})
