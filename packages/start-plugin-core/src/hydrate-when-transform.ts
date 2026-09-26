import { relative } from 'node:path'
import crypto from 'node:crypto'
import { b, is, nameOf, walk } from 'yuku-ast'
import {
  analyzeModule,
  cloneModuleAst,
  collectModuleReferences,
  expandTransitively,
  generateModule,
  moduleDeclarationGraph,
  parseExpression,
  parseStatements,
  removeUnusedBindings,
  unwrapExpression,
} from '@tanstack/router-utils'
import { tssHydrate } from './hydration-constants'
import { cleanId, codeFrameError } from './start-compiler/utils'
import type { Module, Symbol } from 'yuku-analyzer'
import type * as t from '@yuku-toolchain/types'
import type {
  CompileStartFrameworkOptions,
  StartCompilerPlugin,
  StartCompilerTransformResult,
} from './types'

export class MissingHydrateSourceError extends Error {
  constructor(id: string) {
    super(
      `Missing Hydrate source for virtual module ${id}. The parent module must be transformed before its Hydrate child chunk is loaded.`,
    )
  }
}

/**
 * Detection pattern used by the transform code filter to pre-scan files for
 * `<Hydrate>` JSX before any AST parsing happens.
 */
const HYDRATE_DETECTION_PATTERN = /\bHydrate\b/

function createBoundaryId(root: string, sourceId: string) {
  const normalized = relative(root, sourceId).replaceAll('\\', '/')
  const sourceHash = crypto
    .createHash('sha1')
    .update(normalized)
    .digest('hex')
    .slice(0, 10)

  return (index: number) => {
    return `${index.toString(36)}_${sourceHash}`
  }
}

function parseHydrateVirtualId(id: string) {
  const queryIndex = id.indexOf('?')
  const sourceId = cleanId(queryIndex === -1 ? id : id.slice(0, queryIndex))
  if (queryIndex === -1) {
    return { sourceId, splitId: null, boundaryIndex: -1 }
  }

  const rawQuery = id.slice(queryIndex + 1)
  const params = new URLSearchParams(rawQuery)
  const splitId = params.get(tssHydrate)
  let boundaryIndex = -1
  if (splitId) {
    const separatorIndex = splitId.indexOf('_')
    if (separatorIndex > 0) {
      const parsedIndex = Number.parseInt(splitId.slice(0, separatorIndex), 36)
      if (Number.isInteger(parsedIndex)) {
        boundaryIndex = parsedIndex
      }
    }
  }

  return {
    sourceId,
    splitId,
    boundaryIndex,
  }
}

interface HydrateAst {
  ast: t.Program
  module: Module
  originalNodes: WeakMap<t.Node, t.Node>
}

function getJSXElementName(node: t.JSXElement) {
  return is.JSXIdentifier(node.openingElement.name)
    ? node.openingElement.name.name
    : undefined
}

function getJSXAttribute(node: t.JSXOpeningElement, name: string) {
  return node.attributes.find(
    (attribute): attribute is t.JSXAttribute =>
      is.JSXAttribute(attribute) &&
      is.JSXIdentifier(attribute.name) &&
      attribute.name.name === name,
  )
}

function getBooleanProp(node: t.JSXOpeningElement, name: string) {
  const attribute = getJSXAttribute(node, name)
  if (!attribute) {
    return undefined
  }
  if (!attribute.value) {
    return true
  }
  if (is.StringLiteral(attribute.value)) {
    return attribute.value.value !== 'false'
  }
  if (is.JSXExpressionContainer(attribute.value)) {
    const expression = is.Expression(attribute.value.expression)
      ? unwrapExpression(attribute.value.expression)
      : attribute.value.expression
    if (is.BooleanLiteral(expression)) {
      return expression.value
    }
  }
  return undefined
}

function propertyIs(property: t.Property, name: string) {
  return (
    (!property.computed || is.StringLiteral(property.key)) &&
    nameOf(property.key) === name
  )
}

function objectExpressionMayHaveProperty(
  node: t.ObjectExpression,
  name: string,
) {
  return node.properties.some(
    (property) =>
      is.SpreadElement(property) ||
      property.computed ||
      propertyIs(property, name),
  )
}

function stripObjectExpressionProperty(node: t.ObjectExpression, name: string) {
  const before = node.properties.length
  node.properties = node.properties.filter(
    (property) => !is.Property(property) || !propertyIs(property, name),
  )
  return before !== node.properties.length
}

function sourceNode(context: HydrateAst, node: t.Node) {
  return context.originalNodes.get(node) ?? node
}

function getSingleUseObjectExpressionBinding(
  context: HydrateAst,
  identifier: t.Identifier,
  objectExpressions: WeakMap<t.Node, t.ObjectExpression>,
) {
  const original = sourceNode(context, identifier)
  const symbol = context.module.symbolOf(original)
  if (
    !symbol ||
    symbol.references.length !== 1 ||
    symbol.references[0]?.node !== original ||
    symbol.references.some((reference) => reference.isWrite)
  ) {
    return undefined
  }
  const declarationIdentifier = symbol.declarations[0]
  const declaration =
    declarationIdentifier && context.module.parentOf(declarationIdentifier)
  if (!is.VariableDeclarator(declaration) || !declaration.init) {
    return undefined
  }
  const init = unwrapExpression(declaration.init)
  if (!is.ObjectExpression(init)) {
    return undefined
  }
  return objectExpressions.get(init)
}

function isWithin(module: Module, node: t.Node, parent: t.Node) {
  let current: t.Node | null = node
  while (current) {
    if (current === parent) {
      return true
    }
    current = module.parentOf(current)
  }
  return false
}

function inspectSplitBoundary(
  context: HydrateAst,
  node: t.JSXElement,
  options: {
    code: string
    validate?: boolean
    collectCaptured?: boolean
    nestedHydrate?: { localName: string }
  },
) {
  const captured = new Set<string>()
  let nestedBoundaryCount = 0
  const fail = (message: string): never => {
    throw codeFrameError(options.code, sourceNode(context, node), message)
  }
  if (options.validate) {
    for (const child of node.children) {
      const expression =
        is.JSXExpressionContainer(child) && is.Expression(child.expression)
          ? unwrapExpression(child.expression)
          : undefined
      if (
        is.FunctionExpression(expression) ||
        is.ArrowFunctionExpression(expression)
      ) {
        fail(
          'Hydrate cannot code-split function-as-children. Use split={false} for this boundary.',
        )
      }
    }
  }
  const originalBoundary = sourceNode(context, node)
  walk(node, {
    enter(current) {
      if (!options.collectCaptured) {
        return
      }
      const reference = context.module.referenceOf(sourceNode(context, current))
      const symbol = reference?.symbol
      if (
        !reference ||
        reference.inTypePosition ||
        !symbol ||
        symbol.scope === context.module.rootScope
      ) {
        return
      }
      if (
        symbol.declarations.some((declaration) =>
          isWithin(context.module, declaration, originalBoundary),
        )
      ) {
        return
      }
      captured.add(symbol.name)
    },
    JSXOpeningElement(current, visitor) {
      if (current === node.openingElement) {
        visitor.skip()
      }
    },
    JSXClosingElement(_current, visitor) {
      visitor.skip()
    },
    JSXElement(current) {
      if (
        current !== node &&
        options.nestedHydrate &&
        getJSXElementName(current) === options.nestedHydrate.localName &&
        getBooleanProp(current.openingElement, 'split') !== false
      ) {
        nestedBoundaryCount++
      }
    },
    CallExpression(current) {
      const callee = unwrapExpression(current.callee)
      if (
        options.validate &&
        is.Identifier(callee) &&
        /^use[A-Z0-9]/.test(callee.name)
      ) {
        fail(
          'Hydrate cannot code-split JSX that calls hooks during render. Move the hook call into a child component or use split={false}.',
        )
      }
    },
    ThisExpression() {
      if (options.validate) {
        fail('Hydrate cannot code-split JSX that captures this.')
      }
    },
    Super() {
      if (options.validate) {
        fail('Hydrate cannot code-split JSX that captures super.')
      }
    },
  })
  return { captured: [...captured].sort(), nestedBoundaryCount }
}

function getHydrateImport(
  ast: t.Program,
  framework: CompileStartFrameworkOptions,
) {
  for (const statement of ast.body) {
    if (
      !is.ImportDeclaration(statement) ||
      statement.source.value !== `@tanstack/${framework}-start`
    ) {
      continue
    }
    for (const specifier of statement.specifiers) {
      if (
        is.ImportSpecifier(specifier) &&
        nameOf(specifier.imported) === 'Hydrate'
      ) {
        return { hydrateLocalName: specifier.local.name }
      }
    }
  }
  return undefined
}

function getMeaningfulChildren(children: t.JSXElement['children']) {
  return children.filter(
    (child) => !is.JSXText(child) || child.value.trim() !== '',
  )
}

function transformHydrateAst(
  options: HydrateAst & {
    code: string
    id: string
    root: string
    env: 'client' | 'server'
    framework: CompileStartFrameworkOptions
    indexOffset?: number
  },
) {
  if (!options.code.includes('Hydrate')) {
    return null
  }
  const hydrateImport = getHydrateImport(options.ast, options.framework)
  if (!hydrateImport) {
    return null
  }
  const localName = hydrateImport.hydrateLocalName
  const sourceId = cleanId(options.id)
  const getBoundaryId = createBoundaryId(options.root, sourceId)
  let nextBoundaryIndex = options.indexOffset ?? 0
  const transformation = { modified: false }
  let lazyName: string | undefined
  const names = new Set([
    ...options.module.symbols.map((symbol) => symbol.name),
    ...options.module.unresolvedReferences.map((reference) => reference.name),
  ])
  const fresh = (base: string) => {
    let name = `_${base}`
    let count = 2
    while (names.has(name)) {
      name = `_${base}${count++}`
    }
    names.add(name)
    return name
  }
  const prepend: t.Program['body'] = []
  // Index before mutation so spreads can resolve declarations later in the file.
  const objectExpressions = new WeakMap<t.Node, t.ObjectExpression>()
  walk(options.ast, {
    ObjectExpression(node) {
      objectExpressions.set(sourceNode(options, node), node)
    },
  })
  walk(options.ast, {
    JSXElement(node, visitor) {
      if (getJSXElementName(node) !== localName) {
        return
      }
      if (options.env === 'server') {
        node.openingElement.attributes = node.openingElement.attributes.filter(
          (attribute) => {
            if (
              is.JSXAttribute(attribute) &&
              is.JSXIdentifier(attribute.name) &&
              attribute.name.name === 'fallback'
            ) {
              transformation.modified = true
              return false
            }
            if (is.JSXSpreadAttribute(attribute)) {
              const argument = unwrapExpression(attribute.argument)
              const object = is.ObjectExpression(argument)
                ? argument
                : is.Identifier(argument)
                  ? getSingleUseObjectExpressionBinding(
                      options,
                      argument,
                      objectExpressions,
                    )
                  : undefined
              if (object && stripObjectExpressionProperty(object, 'fallback')) {
                transformation.modified = true
              }
              if (is.ObjectExpression(argument)) {
                return argument.properties.length > 0
              }
            }
            return true
          },
        )
      }
      if (getBooleanProp(node.openingElement, 'split') === false) {
        return
      }
      const inspection = inspectSplitBoundary(options, node, {
        code: options.code,
        validate: true,
        collectCaptured: options.env === 'client',
        ...(options.env === 'client' ? { nestedHydrate: { localName } } : {}),
      })
      const index = nextBoundaryIndex
      nextBoundaryIndex += 1 + inspection.nestedBoundaryCount
      const id = getBoundaryId(index)
      const exportName = `H${index}`
      const existingId = getJSXAttribute(node.openingElement, 'h')
      const idValue: t.StringLiteral = {
        type: 'Literal',
        value: id,
        raw: JSON.stringify(id),
        start: 0,
        end: 0,
      }
      if (existingId) {
        existingId.value = idValue
      } else {
        node.openingElement.attributes.push(
          b.JSXAttribute({
            name: b.JSXIdentifier({ name: 'h' }),
            value: idValue,
          }),
        )
      }
      transformation.modified = true
      if (options.env === 'server') {
        return
      }
      const needsPreload = node.openingElement.attributes.some((attribute) => {
        if (is.JSXAttribute(attribute)) {
          return (
            is.JSXIdentifier(attribute.name) &&
            attribute.name.name === 'prefetch'
          )
        }
        const argument = unwrapExpression(attribute.argument)
        const object = is.ObjectExpression(argument)
          ? argument
          : is.Identifier(argument)
            ? getSingleUseObjectExpressionBinding(
                options,
                argument,
                objectExpressions,
              )
            : undefined
        return !object || objectExpressionMayHaveProperty(object, 'prefetch')
      })
      if (!lazyName) {
        lazyName = fresh('lazyRouteComponent')
        prepend.push(
          ...parseStatements(
            `import { lazyRouteComponent as ${lazyName} } from ${JSON.stringify(`@tanstack/${options.framework}-router`)}`,
          ),
        )
      }
      const query = new URLSearchParams({ [tssHydrate]: id })
      const componentName = fresh(exportName)
      prepend.push(
        ...parseStatements(
          `const ${componentName} = ${lazyName}(() => import(${JSON.stringify(`${sourceId}?${query}`)}), ${JSON.stringify(exportName)})`,
        ),
      )
      if (needsPreload) {
        const preloadName = fresh(`${exportName}_preload`)
        prepend.push(
          ...parseStatements(`const ${preloadName} = ${componentName}.preload`),
        )
        node.openingElement.attributes.push(
          b.JSXAttribute({
            name: b.JSXIdentifier({ name: 'p' }),
            value: b.JSXExpressionContainer({
              expression: parseExpression(preloadName),
            }),
          }),
        )
      }
      const props = inspection.captured
        .map((name) => `${name}={${name}}`)
        .join(' ')
      const child = parseExpression(`<${componentName} ${props} />`)
      node.children = [b.JSXExpressionContainer({ expression: child })]
      visitor.skip()
    },
  })
  if (!transformation.modified) {
    return null
  }
  options.ast.body.unshift(...prepend)
  return true
}

function loadHydrateVirtualModule(options: {
  module: Module
  id: string
  root: string
  code: string
  framework: CompileStartFrameworkOptions
}) {
  const { sourceId, splitId, boundaryIndex } = parseHydrateVirtualId(options.id)
  if (!splitId || boundaryIndex < 0) {
    return null
  }
  const module = options.module
  const { program: ast, originalNodes } = cloneModuleAst(module)
  const context = { ast, module, originalNodes }
  const hydrateImport = getHydrateImport(ast, options.framework)
  if (!hydrateImport) {
    return null
  }
  const getBoundaryId = createBoundaryId(options.root, sourceId)
  let target: t.JSXElement | undefined
  let captures: Array<string> = []
  let index = 0
  walk(ast, {
    JSXElement(node, visitor) {
      if (
        getJSXElementName(node) !== hydrateImport.hydrateLocalName ||
        getBooleanProp(node.openingElement, 'split') === false
      ) {
        return
      }
      if (index === boundaryIndex) {
        if (getBoundaryId(index) === splitId) {
          target = node
          captures = inspectSplitBoundary(context, node, {
            code: options.code,
            collectCaptured: true,
          }).captured
        }
        visitor.stop()
      }
      index++
    },
  })
  if (!target) {
    return null
  }
  const children = getMeaningfulChildren(target.children)
  let expression: t.Expression = b.Literal({ value: null, raw: 'null' })
  if (children.length === 1) {
    const child = children[0]!
    if (is.JSXExpressionContainer(child)) {
      expression = is.JSXEmptyExpression(child.expression)
        ? expression
        : child.expression
    } else if (is.JSXText(child)) {
      expression = b.Literal({
        value: child.value,
        raw: JSON.stringify(child.value),
      })
    } else if (is.JSXElement(child) || is.JSXFragment(child)) {
      expression = child
    }
  } else if (children.length > 1) {
    expression = b.JSXFragment({
      openingFragment: b.JSXOpeningFragment({}),
      closingFragment: b.JSXClosingFragment({}),
      children: target.children,
    })
  }
  const graph = moduleDeclarationGraph(module)
  const keep = new Set<Symbol>()
  for (const child of children) {
    for (const symbol of collectModuleReferences(
      module,
      sourceNode(context, child),
    )) {
      if (symbol.name !== 'Route') {
        keep.add(symbol)
      }
    }
  }
  const retained = expandTransitively(keep, graph.dependencies)
  const selected = new Set(
    [...graph.declarationSymbols]
      .filter(([, owners]) =>
        [...owners].some((symbol) => retained.has(symbol)),
      )
      .map(([declaration]) => declaration),
  )
  ast.body = ast.body.flatMap((statement): t.Program['body'] => {
    if (is.ImportDeclaration(statement)) {
      return [statement]
    }
    const declaration =
      is.ExportNamedDeclaration(statement) ||
      is.ExportDefaultDeclaration(statement)
        ? statement.declaration
        : statement
    if (is.VariableDeclaration(declaration)) {
      declaration.declarations = declaration.declarations.filter((item) =>
        selected.has(sourceNode(context, item)),
      )
      return declaration.declarations.length ? [declaration] : []
    }
    if (
      (is.FunctionDeclaration(declaration) ||
        is.ClassDeclaration(declaration) ||
        is.TSDeclareFunction(declaration) ||
        is.TSModuleDeclaration(declaration) ||
        is.TSEnumDeclaration(declaration)) &&
      selected.has(sourceNode(context, declaration))
    ) {
      return [declaration]
    }
    return []
  })
  const params = captures.length ? `{ ${captures.join(', ')} }` : ''
  const output = parseStatements(
    `export function H${boundaryIndex}(${params}) { return null; }`,
  )[0]!
  walk(output, {
    ReturnStatement(node) {
      node.argument = expression
    },
  })
  ast.body.push(output)
  removeUnusedBindings(module, ast, originalNodes, {
    preserveInitiallyUnused: false,
  })
  return generateModule(ast, { source: options.code, filename: options.id })
}
export function createHydrateCompilerPlugin(): StartCompilerPlugin {
  type SourceEntry = {
    module: Module
    code: string
    framework: CompileStartFrameworkOptions
    virtualModules: Map<string, StartCompilerTransformResult | null>
  }

  const sourcesByEnvironment = new Map<string, Map<string, SourceEntry>>()

  const getEnvironmentSources = (envName: string) => {
    let sources = sourcesByEnvironment.get(envName)
    if (!sources) {
      sources = new Map()
      sourcesByEnvironment.set(envName, sources)
    }
    return sources
  }

  const setSource = (
    envName: string,
    id: string,
    code: string,
    framework: CompileStartFrameworkOptions,
    sourceModule?: Module,
  ) => {
    const sourceId = cleanId(id)
    const sources = getEnvironmentSources(envName)
    const existing = sources.get(sourceId)
    if (existing?.code === code && existing.framework === framework) {
      return existing
    }

    const entry = {
      module: sourceModule ?? analyzeModule({ code, filename: sourceId }),
      code,
      framework,
      virtualModules: new Map<string, StartCompilerTransformResult | null>(),
    }
    sources.set(sourceId, entry)
    return entry
  }

  const getSourceEntry = (envName: string, id: string) =>
    sourcesByEnvironment.get(envName)?.get(cleanId(id))

  const deleteSource = (envName: string, id: string) => {
    sourcesByEnvironment.get(envName)?.delete(cleanId(id))
  }

  return {
    name: 'tanstack-start-core:hydrate',
    detect: HYDRATE_DETECTION_PATTERN,
    virtualModuleIdPattern: new RegExp(`[?&]${tssHydrate}=`),
    transformAst(context) {
      const virtualModule = parseHydrateVirtualId(context.id)
      const indexOffset =
        virtualModule.boundaryIndex < 0
          ? undefined
          : virtualModule.boundaryIndex + 1
      const result = transformHydrateAst({
        ast: context.ast,
        module: context.module,
        originalNodes: context.originalNodes,
        code: context.code,
        id: context.id,
        root: context.root,
        env: context.env,
        framework: context.framework,
        indexOffset,
      })

      if (result && virtualModule.boundaryIndex < 0) {
        setSource(
          context.envName,
          context.id,
          context.code,
          context.framework,
          context.module,
        )
      }

      return !!result
    },
    loadVirtualModule(context) {
      const virtualModule = parseHydrateVirtualId(context.id)
      if (!virtualModule.splitId || virtualModule.boundaryIndex < 0) {
        return null
      }

      const existingSourceEntry = getSourceEntry(
        context.envName,
        virtualModule.sourceId,
      )
      const sourceEntry =
        context.code === undefined
          ? existingSourceEntry
          : setSource(
              context.envName,
              virtualModule.sourceId,
              context.code,
              existingSourceEntry?.framework ??
                (context.code.includes('@tanstack/solid-start')
                  ? 'solid'
                  : 'react'),
            )

      if (!sourceEntry) {
        throw new MissingHydrateSourceError(context.id)
      }

      if (sourceEntry.virtualModules.has(context.id)) {
        return sourceEntry.virtualModules.get(context.id)!
      }

      const result = loadHydrateVirtualModule({
        module: sourceEntry.module,
        code: sourceEntry.code,
        id: context.id,
        root: context.root,
        framework: sourceEntry.framework,
      })
      sourceEntry.virtualModules.set(context.id, result)
      return result
    },
    invalidateModule(context) {
      deleteSource(context.envName, context.id)
    },
  }
}
