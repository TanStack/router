import { relative } from 'node:path'
import crypto from 'node:crypto'
import { b, is, nameOf, walk } from 'yuku-ast'
import {
  analyzeModule,
  collectModuleReferences,
  expandTransitively,
  filePragmas,
  generateModule,
  importedNameOf,
  keepFilePragmas,
  linkGeneratedReference,
  moduleDeclarationGraph,
  prepareBindingCleanup,
  prependStatements,
  removeUnusedBindings,
  unwrapExport,
  unwrapExpression,
} from '@tanstack/router-utils'
import { BindingFlags } from 'yuku-analyzer'
import { tssHydrate } from './hydration-constants'
import {
  cleanId,
  codeFrameError,
  generatedReference,
  stringLiteral,
} from './start-compiler/utils'
import type { Binding, Module } from 'yuku-analyzer'
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
  /** Maps a copy's nodes to the source's; without it, `ast` is `module.ast`. */
  originalNodes?: WeakMap<t.Node, t.Node>
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
    const expression = unwrapExpression(attribute.value.expression)
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
  return context.originalNodes?.get(node) ?? node
}

function getSingleUseObjectExpressionBinding(
  context: HydrateAst,
  identifier: t.Identifier,
  objectExpressions: WeakMap<t.Node, t.ObjectExpression>,
) {
  const original = sourceNode(context, identifier)
  const binding = context.module.bindingOf(original)
  if (
    !binding ||
    binding.references.length !== 1 ||
    binding.references[0]?.node !== original ||
    binding.references.some((reference) => reference.isWrite)
  ) {
    return undefined
  }
  const declarationIdentifier = binding.declarations[0]
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

function inspectSplitBoundary(
  context: HydrateAst,
  node: t.JSXElement,
  options: {
    code: string
    validate?: boolean
    collectCaptured?: boolean
    isHydrate?: (node: t.JSXElement) => boolean
  },
) {
  const captured = new Set<string>()
  let nestedBoundaryCount = 0
  const fail = (message: string): never => {
    throw codeFrameError(options.code, sourceNode(context, node), message)
  }
  if (options.validate) {
    for (const child of node.children) {
      const expression = is.JSXExpressionContainer(child)
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
      const binding = reference?.binding
      if (
        !reference ||
        reference.inTypePosition ||
        !binding ||
        binding.scope === context.module.rootScope
      ) {
        return
      }
      for (const declaration of binding.declarations) {
        for (const ancestor of context.module.ancestors(declaration)) {
          if (ancestor === originalBoundary) {
            return
          }
        }
      }
      captured.add(binding.name)
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
        options.isHydrate?.(current) &&
        getBooleanProp(current.openingElement, 'split') !== false
      ) {
        nestedBoundaryCount++
      }
    },
    CallExpression(current) {
      const callee = unwrapExpression(current.callee)
      // `useHook()`, or `React.useHook()` through a namespace or an object
      const name = is.Identifier(callee)
        ? callee.name
        : is.MemberExpression(callee) && is.Identifier(callee.property)
          ? callee.property.name
          : undefined
      if (options.validate && name && /^use[A-Z0-9]/.test(name)) {
        fail(
          'Hydrate cannot code-split JSX that calls hooks during render. Move the hook call into a child component or use split={false}.',
        )
      }
    },
    Identifier(current, visitor) {
      if (
        options.validate &&
        current.name === 'arguments' &&
        context.module.referenceOf(sourceNode(context, current)) &&
        !ownsThisAndArguments(visitor.ancestors())
      ) {
        fail(
          "Hydrate cannot code-split JSX that reads the component's arguments.",
        )
      }
    },
    ThisExpression(_current, visitor) {
      if (options.validate && !ownsThisAndArguments(visitor.ancestors())) {
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

/**
 * Whether code under these ancestors (from the split boundary down) has its
 * own `this` and `arguments`, from a function, a class member or a static
 * block in the boundary rather than from the component.
 */
function ownsThisAndArguments(ancestors: Array<t.Node>) {
  return ancestors.some(
    (ancestor) =>
      (is.Function(ancestor) && !is.ArrowFunctionExpression(ancestor)) ||
      is.PropertyDefinition(ancestor) ||
      is.AccessorProperty(ancestor) ||
      is.StaticBlock(ancestor),
  )
}

/** Whether a module imports `Hydrate`, by name or with its whole package. */
function importsHydrate(
  module: Module,
  framework: CompileStartFrameworkOptions,
) {
  return module.imports.some(
    (record) =>
      (record.kind === 'namespace' ||
        (record.kind === 'named' && record.name === 'Hydrate')) &&
      record.specifier === `@tanstack/${framework}-start`,
  )
}

/** Whether an element is a `<Hydrate>` boundary, by binding rather than name. */
function isHydrateElement(
  context: HydrateAst,
  framework: CompileStartFrameworkOptions,
  node: t.JSXElement,
) {
  const imported = importedNameOf(
    context.module,
    sourceNode(context, node.openingElement.name),
  )
  return (
    imported?.name === 'Hydrate' &&
    imported.source === `@tanstack/${framework}-start`
  )
}

function getMeaningfulChildren(children: t.JSXElement['children']) {
  return children.filter(
    (child) => !is.JSXText(child) || child.value.trim() !== '',
  )
}

export function jsxAttribute(name: string, expression: t.Expression) {
  return b.JSXAttribute({
    name: b.JSXIdentifier({ name }),
    value: b.JSXExpressionContainer({ expression }),
  })
}

export function constDeclaration(name: string, init: t.Expression) {
  return b.VariableDeclaration({
    kind: 'const',
    declarations: [b.VariableDeclarator({ id: b.Identifier({ name }), init })],
  })
}

export function importDeclaration(
  imported: t.Identifier | t.StringLiteral,
  local: string,
  source: string,
) {
  return b.ImportDeclaration({
    specifiers: [
      b.ImportSpecifier({
        imported,
        local: b.Identifier({ name: local }),
        importKind: 'value',
      }),
    ],
    source: stringLiteral(source),
    phase: null,
    attributes: [],
    importKind: 'value',
  })
}

/** `const <componentName> = <lazyName>(() => import("<source>"), "<exportName>")` */
export function lazyComponent(
  componentName: string,
  lazyName: string,
  source: string,
  exportName: string,
) {
  return constDeclaration(
    componentName,
    b.CallExpression({
      callee: generatedReference(lazyName),
      arguments: [
        b.ArrowFunctionExpression({
          id: null,
          generator: false,
          async: false,
          expression: true,
          params: [],
          body: b.ImportExpression({
            source: stringLiteral(source),
            options: null,
            phase: null,
          }),
        }),
        stringLiteral(exportName),
      ],
      optional: false,
    }),
  )
}

/** `const <preloadName> = <componentName>.preload` */
export function preloadAlias(preloadName: string, componentName: string) {
  return constDeclaration(
    preloadName,
    b.MemberExpression({
      object: generatedReference(componentName),
      property: b.Identifier({ name: 'preload' }),
      computed: false,
      optional: false,
    }),
  )
}

/** `<componentName capture={capture} … />` */
export function boundaryChild(componentName: string, captured: Array<string>) {
  return b.JSXElement({
    openingElement: b.JSXOpeningElement({
      name: linkGeneratedReference(
        b.JSXIdentifier({ name: componentName }),
        componentName,
      ),
      attributes: captured.map((name) =>
        jsxAttribute(name, generatedReference(name)),
      ),
      selfClosing: true,
    }),
    children: [],
    closingElement: null,
  })
}

/** `export function H<boundaryIndex>({ <captures> }) { return <expression> }` */
export function boundaryComponent(
  boundaryIndex: number,
  captures: Array<string>,
  expression: t.Expression,
) {
  return b.ExportNamedDeclaration({
    declaration: b.FunctionDeclaration({
      id: b.Identifier({ name: `H${boundaryIndex}` }),
      generator: false,
      async: false,
      params: captures.length
        ? [
            b.ObjectPattern({
              properties: captures.map(
                // `b.Property` is typed as an object or a binding property
                (name): t.BindingProperty => ({
                  type: 'Property',
                  start: 0,
                  end: 0,
                  kind: 'init',
                  key: b.Identifier({ name }),
                  value: b.Identifier({ name }),
                  method: false,
                  shorthand: true,
                  computed: false,
                }),
              ),
            }),
          ]
        : [],
      body: b.BlockStatement({
        body: [b.ReturnStatement({ argument: expression })],
      }),
      expression: false,
    }),
    specifiers: [],
    source: null,
    attributes: [],
    exportKind: 'value',
  })
}

function setChildren(node: t.JSXElement, children: t.JSXElement['children']) {
  node.children = children
  if (node.openingElement.selfClosing) {
    node.openingElement.selfClosing = false
    node.closingElement = b.JSXClosingElement({
      name: { ...node.openingElement.name },
    })
  }
}

/**
 * Moves a boundary's `children` prop into its JSX children, so
 * `<Hydrate children={content} />` splits like `<Hydrate>{content}</Hydrate>`.
 *
 * @returns false when props may still provide the children (e.g. a spread
 * after the `children` prop), which cannot be split.
 */
function moveChildrenPropIntoChildren(node: t.JSXElement) {
  if (getMeaningfulChildren(node.children).length) {
    // JSX children take precedence over a children prop.
    return true
  }
  // The last spread or children prop determines the children.
  const attributes = node.openingElement.attributes
  let index = attributes.length - 1
  for (; index >= 0; index--) {
    const attribute = attributes[index]!
    if (
      is.JSXSpreadAttribute(attribute) ||
      (is.JSXIdentifier(attribute.name) && attribute.name.name === 'children')
    ) {
      break
    }
  }
  const attribute = attributes[index]
  if (!attribute) {
    return true
  }
  if (
    is.JSXSpreadAttribute(attribute) ||
    !attribute.value ||
    is.StringLiteral(attribute.value)
  ) {
    return false
  }
  attributes.splice(index, 1)
  setChildren(node, [attribute.value])
  return true
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
  if (!importsHydrate(options.module, options.framework)) {
    return null
  }
  const isHydrate = (node: t.JSXElement) =>
    isHydrateElement(options, options.framework, node)
  const sourceId = cleanId(options.id)
  const getBoundaryId = createBoundaryId(options.root, sourceId)
  let nextBoundaryIndex = options.indexOffset ?? 0
  const transformation = { modified: false }
  let lazyName: string | undefined
  const names = new Set([
    ...options.module.bindings.map((binding) => binding.name),
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
      if (!isHydrate(node)) {
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
      const splittable = moveChildrenPropIntoChildren(node)
      const inspection = inspectSplitBoundary(options, node, {
        code: options.code,
        validate: true,
        collectCaptured: options.env === 'client',
        ...(options.env === 'client' ? { isHydrate } : {}),
      })
      const index = nextBoundaryIndex
      nextBoundaryIndex += 1 + inspection.nestedBoundaryCount
      const id = getBoundaryId(index)
      const exportName = `H${index}`
      const existingId = getJSXAttribute(node.openingElement, 'h')
      const idValue = b.Literal({
        value: id,
        raw: JSON.stringify(id),
      }) as t.StringLiteral
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
      if (options.env === 'server' || !splittable) {
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
        // import { lazyRouteComponent as <lazyName> } from "@tanstack/<framework>-router"
        prepend.push(
          importDeclaration(
            b.Identifier({ name: 'lazyRouteComponent' }),
            lazyName,
            `@tanstack/${options.framework}-router`,
          ),
        )
      }
      const query = new URLSearchParams({ [tssHydrate]: id })
      const componentName = fresh(exportName)
      prepend.push(
        lazyComponent(
          componentName,
          lazyName,
          `${sourceId}?${query}`,
          exportName,
        ),
      )
      if (needsPreload) {
        const preloadName = fresh(`${exportName}_preload`)
        prepend.push(preloadAlias(preloadName, componentName))
        node.openingElement.attributes.push(
          jsxAttribute('p', generatedReference(preloadName)),
        )
      }
      const child = boundaryChild(componentName, inspection.captured)
      setChildren(node, [b.JSXExpressionContainer({ expression: child })])
      visitor.skip()
    },
  })
  if (!transformation.modified) {
    return null
  }
  prependStatements(options.ast, ...prepend)
  return true
}

function loadHydrateVirtualModule(options: {
  id: string
  root: string
  code: string
  framework: CompileStartFrameworkOptions
}) {
  const { sourceId, splitId, boundaryIndex } = parseHydrateVirtualId(options.id)
  if (!splitId || boundaryIndex < 0) {
    return null
  }
  const module = analyzeModule({ code: options.code, filename: sourceId })
  if (!importsHydrate(module, options.framework)) {
    return null
  }
  const ast = module.ast
  const context = { ast, module }
  const getBoundaryId = createBoundaryId(options.root, sourceId)
  let target: t.JSXElement | undefined
  let index = 0
  walk(ast, {
    JSXElement(node, visitor) {
      if (
        !isHydrateElement(context, options.framework, node) ||
        getBooleanProp(node.openingElement, 'split') === false
      ) {
        return
      }
      if (index === boundaryIndex) {
        if (getBoundaryId(index) === splitId) {
          target = node
        }
        visitor.stop()
      }
      index++
    },
  })
  if (!target) {
    return null
  }
  // The output edits the analyzed tree in place: read its structure first
  const graph = moduleDeclarationGraph(module)
  const cleanup = prepareBindingCleanup(module)
  const pragmas = filePragmas(ast)
  if (!moveChildrenPropIntoChildren(target)) {
    return null
  }
  const captures = inspectSplitBoundary(context, target, {
    code: options.code,
    collectCaptured: true,
  }).captured
  const children = getMeaningfulChildren(target.children)
  const child = children.length === 1 ? children[0] : undefined
  let expression: t.Expression = b.Literal({ value: null, raw: 'null' })
  if (is.JSXExpressionContainer(child)) {
    if (!is.JSXEmptyExpression(child.expression)) {
      expression = child.expression
    }
  } else if (is.JSXElement(child) || is.JSXFragment(child)) {
    expression = child
  } else if (children.length) {
    // Keep text as JSX so the JSX compiler applies entity and whitespace rules.
    expression = b.JSXFragment({
      openingFragment: b.JSXOpeningFragment({}),
      closingFragment: b.JSXClosingFragment({}),
      children: target.children,
    })
  }
  const keep = new Set<Binding>()
  for (const child of children) {
    for (const binding of collectModuleReferences(module, child)) {
      keep.add(binding)
    }
  }
  // The route is a singleton: code reading the module's `Route` imports the
  // parent module's instead of creating the route again with its options.
  const route = module.rootScope.bindings.find(
    (binding) => binding.name === 'Route' && !binding.has(BindingFlags.Import),
  )
  const retained = expandTransitively(
    keep,
    new Map([...graph.dependencies].filter(([binding]) => binding !== route)),
  )
  if (route && retained.delete(route)) {
    const { exports: moduleExports } = module
    const exportedNames = moduleExports
      .filter((entry) => entry.local === route && !entry.typeOnly)
      .map((entry) => entry.name)
    const exported = exportedNames.includes('Route')
      ? 'Route'
      : exportedNames.find((name) => name !== null)
    if (!exported) {
      throw codeFrameError(
        options.code,
        target,
        'Hydrate cannot code-split children that read Route when the module does not export it. Export Route, or use split={false} for this boundary.',
      )
    }
    // import { <exported> as Route } from "<sourceId>"
    prependStatements(
      ast,
      importDeclaration(
        /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(exported)
          ? b.Identifier({ name: exported })
          : stringLiteral(exported),
        'Route',
        sourceId,
      ),
    )
  }
  const selected = new Set(
    [...graph.declarationBindings]
      .filter(([, owners]) =>
        [...owners].some((binding) => retained.has(binding)),
      )
      .map(([declaration]) => declaration),
  )
  ast.body = ast.body.flatMap((statement): t.Program['body'] => {
    if (is.ImportDeclaration(statement) || is.Directive(statement)) {
      return [statement]
    }
    const declaration =
      is.ExportNamedDeclaration(statement) ||
      is.ExportDefaultDeclaration(statement)
        ? statement.declaration
        : statement
    if (is.VariableDeclaration(declaration)) {
      declaration.declarations = declaration.declarations.filter((item) =>
        selected.has(item),
      )
      return declaration.declarations.length
        ? [unwrapExport(statement, declaration)]
        : []
    }
    if (
      (is.FunctionDeclaration(declaration) ||
        is.ClassDeclaration(declaration) ||
        is.TSDeclareFunction(declaration) ||
        is.TSModuleDeclaration(declaration) ||
        is.TSEnumDeclaration(declaration) ||
        is.TSImportEqualsDeclaration(declaration)) &&
      selected.has(declaration)
    ) {
      return [unwrapExport(statement, declaration)]
    }
    return []
  })
  ast.body.push(boundaryComponent(boundaryIndex, captures, expression))
  removeUnusedBindings(module, ast, cleanup)
  keepFilePragmas(pragmas, ast)
  return generateModule(ast, { source: options.code, filename: options.id })
}
export function createHydrateCompilerPlugin(): StartCompilerPlugin {
  type SourceEntry = {
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
  ) => {
    const sourceId = cleanId(id)
    const sources = getEnvironmentSources(envName)
    const existing = sources.get(sourceId)
    if (existing?.code === code && existing.framework === framework) {
      return existing
    }

    const entry = {
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
        setSource(context.envName, context.id, context.code, context.framework)
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
