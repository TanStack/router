import { b, bindingIdentifiers, is, isIdentifierName, walk } from 'yuku-ast'
import { SymbolFlags } from 'yuku-analyzer'
import {
  analyzeModule,
  cloneModuleAst,
  collectModuleReferences,
  createIdentifier,
  expandTransitively,
  generateModule,
  linkGeneratedReference,
  moduleDeclarationGraph,
  parseStatements,
  removeUnusedBindings,
  unwrapExpression,
} from '@tanstack/router-utils'
import { tsrShared, tsrSplit } from '../constants'
import { createRouteHmrStatement } from '../hmr'
import { getObjectPropertyKeyName, getUniqueProgramIdentifier } from '../utils'
import { getFrameworkOptions } from './framework-options'
import type { Module, Symbol } from 'yuku-analyzer'
import type {
  Expression,
  Node,
  ObjectExpression,
  ObjectProperty,
  Program,
  ProgramStatement,
  StringLiteral,
} from '@yuku-toolchain/types'
import type { AnalyzeModuleOptions } from '@tanstack/router-utils'
import type {
  CodeSplitCompilerPlugin,
  CompileCodeSplitReferenceRouteOptions,
  ReferenceRouteCompilerPluginContext,
} from './plugins'
import type { CodeSplitGroupings, SplitRouteIdentNodes } from '../constants'
import type { SplitNodeMeta } from './types'

const splitKeys: Array<SplitRouteIdentNodes> = [
  'loader',
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]
const factoryNames = new Set([
  'createFileRoute',
  'createRoute',
  'createRootRoute',
  'createRootRouteWithContext',
])

function splitMeta(key: SplitRouteIdentNodes): SplitNodeMeta {
  const capitalized = `${key[0]!.toUpperCase()}${key.slice(1)}`
  return {
    routeIdent: key,
    localImporterIdent: `$$split${capitalized}Importer`,
    splitStrategy: key === 'loader' ? 'lazyFn' : 'lazyRouteComponent',
    localExporterIdent: `Split${capitalized}`,
    exporterIdent: key,
  }
}

function bareFilename(filename: string) {
  return filename.split('?')[0]!
}

function splitFilename(filename: string, grouping: Array<string>) {
  return `${bareFilename(filename)}?${tsrSplit}=${createIdentifier(grouping)}`
}

export function addSharedSearchParamToFilename(filename: string) {
  return `${bareFilename(filename)}?${tsrShared}=1`
}

type RouteDefinition = {
  options: ObjectExpression
  factory: string
  statement: Node
}

/** Source syntax and semantic identities are immutable across all output chunks. */
export type RouteModuleAnalysis = {
  module: Module
  routes: Array<RouteDefinition>
  graph: ReturnType<typeof moduleDeclarationGraph>
  exported: Map<Symbol, Array<string>>
}

type SourceOptions = AnalyzeModuleOptions & { analysis?: RouteModuleAnalysis }

function resolveExpression(
  module: Module,
  node: Node | null | undefined,
  seen = new Set<Symbol>(),
): Node | undefined {
  if (!node) {
    return undefined
  }
  if (is.Expression(node)) {
    node = unwrapExpression(node)
  }
  if (is.Identifier(node)) {
    const symbol = module.symbolOf(node)
    if (!symbol || seen.has(symbol)) {
      return undefined
    }
    seen.add(symbol)
    let declaration: Node | null | undefined = symbol.declarations[0]
    while (
      declaration &&
      !is.VariableDeclarator(declaration) &&
      !is.Program(declaration)
    ) {
      declaration = module.parentOf(declaration)
    }
    if (is.VariableDeclarator(declaration) && is.Identifier(declaration.id)) {
      return resolveExpression(module, declaration.init, seen)
    }
    return undefined
  }
  return node
}

export function analyzeRouteModule(
  options: AnalyzeModuleOptions,
): RouteModuleAnalysis {
  const module = analyzeModule(options)
  const routes: Array<RouteDefinition> = []
  const seen = new Set<Node>()
  module.walk({
    CallExpression(node) {
      const outerCallee = unwrapExpression(node.callee)
      const callee = unwrapExpression(
        is.CallExpression(outerCallee) ? outerCallee.callee : outerCallee,
      )
      if (!is.Identifier(callee) || !factoryNames.has(callee.name)) {
        return
      }
      const options = resolveExpression(module, node.arguments[0])
      if (!is.ObjectExpression(options) || seen.has(options)) {
        return
      }
      seen.add(options)
      let statement: Node = node
      let parent = module.parentOf(statement)
      while (parent && !is.Program(parent)) {
        statement = parent
        parent = module.parentOf(statement)
      }
      routes.push({ options, factory: callee.name, statement })
    },
  })
  const exported = new Map<Symbol, Array<string>>()
  const { exports: moduleExports } = module
  for (const entry of moduleExports) {
    if (entry.local && entry.name !== null && !entry.typeOnly) {
      const names = exported.get(entry.local) ?? []
      if (!names.includes(entry.name)) {
        names.push(entry.name)
      }
      exported.set(entry.local, names)
    }
  }
  return { module, routes, graph: moduleDeclarationGraph(module), exported }
}

function sourceAnalysis(options: SourceOptions) {
  return options.analysis ?? analyzeRouteModule(options)
}

function isFallback(value: Expression) {
  value = unwrapExpression(value)
  return (
    (is.Literal(value) &&
      (value.value === null || typeof value.value === 'boolean')) ||
    (is.Identifier(value) && value.name === 'undefined')
  )
}

function properties(route: RouteDefinition) {
  return route.options.properties.filter(
    (property): property is ObjectProperty => is.Property(property),
  )
}

function isDataProperty(property: ObjectProperty) {
  return !property.method && property.kind === 'init'
}

/** Assign each initializer and its dependencies to the chunks that consume it. */
export function computeSharedBindings(
  options: SourceOptions & { codeSplitGroupings: CodeSplitGroupings },
): Set<string> {
  const analysis = sourceAnalysis(options)
  const { module, graph } = analysis
  const groupsBySymbol = new Map<Symbol, Set<number>>()
  const chunkDependencies = new Map(
    [...graph.dependencies].map(([symbol, dependencies]) => [
      symbol,
      new Set(
        [...dependencies].filter((dependency) => dependency.name !== 'Route'),
      ),
    ]),
  )
  const locals = new Set(
    module.rootScope.bindings.filter(
      (symbol) => symbol.name !== 'Route' && !symbol.has(SymbolFlags.Import),
    ),
  )
  for (const route of analysis.routes) {
    if (route.factory !== 'createFileRoute') {
      continue
    }
    for (const property of properties(route)) {
      const key = getObjectPropertyKeyName(property)
      if (!key || key === 'codeSplitGroupings' || isFallback(property.value)) {
        continue
      }
      const group = isDataProperty(property)
        ? options.codeSplitGroupings.findIndex((keys) =>
            keys.includes(key as SplitRouteIdentNodes),
          )
        : -1
      const references = expandTransitively(
        collectModuleReferences(module, property.value),
        chunkDependencies,
      )
      for (const symbol of references) {
        if (!locals.has(symbol)) {
          continue
        }
        const groups = groupsBySymbol.get(symbol) ?? new Set<number>()
        groups.add(group)
        groupsBySymbol.set(symbol, groups)
      }
    }
  }
  const shared = new Set<Symbol>()
  for (const [symbol, groups] of groupsBySymbol) {
    if (groups.size > 1) {
      shared.add(symbol)
    }
  }
  // A destructured initializer belongs to one module even when its individual
  // bindings are used in different chunks.
  for (const siblings of graph.declarationSymbols.values()) {
    const groups = new Set(
      [...siblings].flatMap((symbol) => [
        ...(groupsBySymbol.get(symbol) ?? []),
      ]),
    )
    if (groups.size > 1 || [...siblings].some((symbol) => shared.has(symbol))) {
      for (const symbol of siblings) {
        if (locals.has(symbol)) {
          shared.add(symbol)
        }
      }
    }
  }
  const forbidden = new Set(
    module.rootScope.bindings.filter((symbol) => symbol.name === 'Route'),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const [symbol, dependencies] of graph.dependencies) {
      if (
        !forbidden.has(symbol) &&
        [...dependencies].some((dependency) => forbidden.has(dependency))
      ) {
        forbidden.add(symbol)
        changed = true
      }
    }
    for (const siblings of graph.declarationSymbols.values()) {
      if ([...siblings].some((symbol) => forbidden.has(symbol))) {
        for (const symbol of siblings) {
          if (!forbidden.has(symbol)) {
            forbidden.add(symbol)
            changed = true
          }
        }
      }
    }
  }
  return new Set(
    [...shared]
      .filter((symbol) => !forbidden.has(symbol))
      .map((symbol) => symbol.name),
  )
}

function identifier(name: string) {
  return b.Identifier({ name })
}
function reference(name: string, symbol?: Symbol) {
  const node = identifier(name)
  linkGeneratedReference(node, symbol ?? name)
  return node
}
function string(value: string) {
  return b.Literal({ value, raw: JSON.stringify(value) }) as StringLiteral
}
function moduleName(name: string) {
  return isIdentifierName(name) ? identifier(name) : string(name)
}
function imports(
  names: Array<{ local: string; imported: string }>,
  source: string,
) {
  return b.ImportDeclaration({
    source: string(source),
    attributes: [],
    phase: null,
    specifiers: names.map(({ local, imported }) =>
      b.ImportSpecifier({
        local: identifier(local),
        imported: moduleName(imported),
      }),
    ),
  })
}
function exports(
  names: Array<{ local: string; exported: string; symbol?: Symbol }>,
  source: string | null = null,
) {
  return b.ExportNamedDeclaration({
    declaration: null,
    source: source === null ? null : string(source),
    attributes: [],
    specifiers: names.map(({ local, exported, symbol }) =>
      b.ExportSpecifier({
        local: source === null ? reference(local, symbol) : moduleName(local),
        exported: moduleName(exported),
      }),
    ),
  })
}
function variable(name: string, init: Expression) {
  return b.VariableDeclaration({
    kind: 'const',
    declarations: [b.VariableDeclarator({ id: identifier(name), init })],
  })
}
function call(name: string, args: Array<Expression>) {
  return b.CallExpression({
    callee: reference(name),
    arguments: args,
    optional: false,
  })
}

function prepend(program: Program, ...statements: Array<ProgramStatement>) {
  const firstStatement = program.body.findIndex(
    (statement) => !is.Directive(statement),
  )
  program.body.splice(
    firstStatement === -1 ? program.body.length : firstStatement,
    0,
    ...statements,
  )
}

function createOutput(analysis: RouteModuleAnalysis) {
  const { program, originalNodes } = cloneModuleAst(analysis.module)
  const copies = new Map<Node, Node>()
  walk(program, {
    enter(node) {
      copies.set(originalNodes.get(node)!, node)
    },
  })
  const renameBinding = (node: Node, name: string) => {
    const original = originalNodes.get(node)
    const symbol = original ? analysis.module.symbolOf(original) : null
    if (!symbol) {
      return
    }
    const declarationExports = new Map<Node, typeof analysis.module.exports>()
    for (const entry of analysis.module.exports) {
      if (!entry.local || entry.name === null || entry.typeOnly) {
        continue
      }
      let statement: Node = entry.node
      let parent = analysis.module.parentOf(statement)
      while (parent && !is.Program(parent)) {
        statement = parent
        parent = analysis.module.parentOf(statement)
      }
      if (is.ExportNamedDeclaration(statement) && statement.declaration) {
        const entries = declarationExports.get(statement) ?? []
        declarationExports.set(statement, [...entries, entry])
      }
    }
    const aliasedNames = new Set<string>()
    for (const [statement, entries] of declarationExports) {
      const copy = copies.get(statement)
      if (
        !entries.some((entry) => entry.local === symbol) ||
        !is.ExportNamedDeclaration(copy) ||
        !copy.declaration
      ) {
        continue
      }
      const index = program.body.indexOf(copy)
      if (index !== -1) {
        const uniqueEntries = entries.filter((entry) => {
          if (aliasedNames.has(entry.name!)) {
            return false
          }
          aliasedNames.add(entry.name!)
          return true
        })
        const aliases = exports(
          uniqueEntries.map((entry) => ({
            local: entry.local!.name,
            exported: entry.name!,
            symbol: entry.local!,
          })),
        )
        for (const [index, entry] of uniqueEntries.entries()) {
          originalNodes.set(aliases.specifiers[index]!.local, entry.node)
        }
        program.body.splice(
          index,
          1,
          copy.declaration,
          ...(uniqueEntries.length ? [aliases] : []),
        )
      }
    }
    walk(program, {
      enter(candidate, context) {
        if (!is.Identifier(candidate) && !is.JSXIdentifier(candidate)) {
          return
        }
        const source = originalNodes.get(candidate)
        if (source && analysis.module.symbolOf(source) === symbol) {
          candidate.name = name
          const parent = context.parent
          if (
            is.Property(parent) &&
            parent.shorthand &&
            is.Identifier(parent.key) &&
            is.Identifier(parent.value) &&
            parent.key.name !== parent.value.name
          ) {
            parent.shorthand = false
          }
        }
      },
    })
  }
  return { program, originalNodes, copies, renameBinding }
}

function removeDeclarations(program: Program, names: Set<string>) {
  const removedDefaultExports = new Set<Node>()
  walk(program, {
    enter(node, context) {
      if (
        (is.TSEnumDeclaration(node) ||
          is.TSModuleDeclaration(node) ||
          is.TSDeclareFunction(node)) &&
        node.id &&
        is.Identifier(node.id) &&
        names.has(node.id.name) &&
        (is.Program(context.parent) ||
          is.ExportNamedDeclaration(context.parent))
      ) {
        context.remove()
      }
    },
    VariableDeclarator(node, context) {
      const container = context.ancestors().at(-2)
      if (!is.Program(container) && !is.ExportNamedDeclaration(container)) {
        return
      }
      if (bindingIdentifiers(node.id).every((id) => names.has(id.name))) {
        context.remove()
      }
    },
    FunctionDeclaration(node, context) {
      if (
        node.id &&
        names.has(node.id.name) &&
        (is.Program(context.parent) ||
          is.ExportNamedDeclaration(context.parent) ||
          is.ExportDefaultDeclaration(context.parent))
      ) {
        if (is.ExportDefaultDeclaration(context.parent)) {
          removedDefaultExports.add(context.parent)
        }
        context.remove()
      }
    },
    ClassDeclaration(node, context) {
      if (
        node.id &&
        names.has(node.id.name) &&
        (is.Program(context.parent) ||
          is.ExportNamedDeclaration(context.parent) ||
          is.ExportDefaultDeclaration(context.parent))
      ) {
        if (is.ExportDefaultDeclaration(context.parent)) {
          removedDefaultExports.add(context.parent)
        }
        context.remove()
      }
    },
    leave(node, context) {
      if (
        (is.VariableDeclaration(node) && node.declarations.length === 0) ||
        (is.ExportNamedDeclaration(node) &&
          !node.declaration &&
          node.specifiers.length === 0 &&
          !node.source) ||
        removedDefaultExports.has(node)
      ) {
        context.remove()
      }
    },
  })
}

function addSharedImports(
  program: Program,
  shared: Set<string> | undefined,
  filename: string,
) {
  if (shared?.size) {
    removeDeclarations(program, shared)
    prepend(
      program,
      imports(
        [...shared].map((name) => ({ local: name, imported: name })),
        addSharedSearchParamToFilename(filename),
      ),
    )
  }
}

export function compileCodeSplitReferenceRoute(
  options: SourceOptions &
    CompileCodeSplitReferenceRouteOptions & {
      compilerPlugins?: Array<CodeSplitCompilerPlugin>
    },
) {
  const analysis = sourceAnalysis(options)
  const output = createOutput(analysis)
  const { program, originalNodes, copies, renameBinding } = output
  const framework = getFrameworkOptions(options.targetFramework)
  const lazyImports = new Map<string, string>()
  const knownExported = new Set<string>()
  let modified = false
  let hmrAdded = false
  for (const route of analysis.routes) {
    const routeOptions = copies.get(route.options) as ObjectExpression
    const insertionStatement = copies.get(route.statement) as ProgramStatement
    const context: ReferenceRouteCompilerPluginContext = {
      program,
      module: analysis.module,
      originalNodes,
      renameBinding,
      routeOptions,
      createRouteFn: route.factory,
      opts: options,
      insertBefore(nodes) {
        program.body.splice(
          program.body.indexOf(insertionStatement),
          0,
          ...nodes,
        )
      },
    }
    for (const plugin of options.compilerPlugins ?? []) {
      modified = !!plugin.onRouteOptions?.(context)?.modified || modified
    }
    if (options.deleteNodes?.size) {
      routeOptions.properties = routeOptions.properties.filter((property) => {
        const remove =
          is.Property(property) &&
          options.deleteNodes!.has(getObjectPropertyKeyName(property) ?? '')
        modified ||= remove
        return !remove
      })
    }
    if (route.factory === 'createFileRoute') {
      for (const prop of routeOptions.properties) {
        if (!is.Property(prop) || !isDataProperty(prop)) {
          continue
        }
        const key = getObjectPropertyKeyName(prop) as SplitRouteIdentNodes
        const group = options.codeSplitGroupings.find((keys) =>
          keys.includes(key),
        )
        if (!group || !splitKeys.includes(key) || isFallback(prop.value)) {
          continue
        }
        const original = originalNodes.get(unwrapExpression(prop.value))
        const symbol =
          original && is.Identifier(original)
            ? analysis.module.symbolOf(original)
            : null
        if (symbol && analysis.exported.has(symbol)) {
          knownExported.add(symbol.name)
          continue
        }
        const meta = splitMeta(key)
        let lazy = lazyImports.get(meta.splitStrategy)
        if (!lazy) {
          lazy = getUniqueProgramIdentifier(program, meta.splitStrategy).name
          prepend(
            program,
            imports(
              [{ local: lazy, imported: meta.splitStrategy }],
              framework.package,
            ),
          )
          lazyImports.set(meta.splitStrategy, lazy)
        }
        meta.localImporterIdent = getUniqueProgramIdentifier(
          program,
          meta.localImporterIdent,
        ).name
        prepend(
          program,
          variable(
            meta.localImporterIdent,
            b.ArrowFunctionExpression({
              id: null,
              generator: false,
              async: false,
              expression: true,
              params: [],
              body: b.ImportExpression({
                source: string(splitFilename(options.filename, group)),
                options: null,
                phase: null,
              }),
            }),
          ),
        )
        let value: Expression | undefined = undefined
        for (const plugin of options.compilerPlugins ?? []) {
          value =
            plugin.onSplitRouteProperty?.({
              ...context,
              prop,
              splitNodeMeta: meta,
              lazyRouteComponentIdent: lazy,
            }) ?? undefined
          if (value) {
            break
          }
        }
        prop.value =
          value ??
          call(lazy, [
            reference(meta.localImporterIdent),
            string(meta.exporterIdent),
          ])
        prop.shorthand = false
        modified = true
      }
    } else {
      for (const plugin of options.compilerPlugins ?? []) {
        modified = !!plugin.onUnsplittableRoute?.(context)?.modified || modified
      }
    }
    if (options.addHmr && !hmrAdded) {
      for (const plugin of options.compilerPlugins ?? []) {
        plugin.onAddHmr?.(context)
      }
      const stableKeys = [
        ...new Set(
          (options.compilerPlugins ?? []).flatMap(
            (plugin) => plugin.getStableRouteOptionKeys?.() ?? [],
          ),
        ),
      ]
      program.body.push(
        ...createRouteHmrStatement(stableKeys, {
          hmrStyle: options.hmrStyle ?? 'vite',
          targetFramework: options.targetFramework,
          routeId: options.hmrRouteId,
        }),
      )
      modified = true
      hmrAdded = true
    }
  }
  if (!modified) {
    return null
  }
  if (options.sharedBindings?.size) {
    program.body = program.body.filter((statement) => {
      if (
        is.ExportNamedDeclaration(statement) &&
        !statement.source &&
        !statement.declaration
      ) {
        statement.specifiers = statement.specifiers.filter(
          (specifier) =>
            !is.Identifier(specifier.local) ||
            !options.sharedBindings!.has(specifier.local.name),
        )
        return statement.specifiers.length > 0
      }
      return !(
        is.ExportDefaultDeclaration(statement) &&
        is.Identifier(statement.declaration) &&
        options.sharedBindings!.has(statement.declaration.name)
      )
    })
  }
  addSharedImports(program, options.sharedBindings, options.filename)
  const sharedExports = [...analysis.exported]
    .filter(([symbol]) => options.sharedBindings?.has(symbol.name))
    .flatMap(([symbol, names]) =>
      names.map((name) => ({ local: symbol.name, exported: name })),
    )
  if (sharedExports.length) {
    program.body.push(
      exports(sharedExports, addSharedSearchParamToFilename(options.filename)),
    )
  }
  removeUnusedBindings(analysis.module, program, originalNodes)
  if (knownExported.size) {
    const message = createNotExportableMessage(options.filename, knownExported)
    console.warn(message)
    if (process.env.NODE_ENV !== 'production') {
      prepend(
        program,
        ...parseStatements(`console.warn(${JSON.stringify(message)})`),
      )
    }
  }
  return generateModule(program, {
    source: options.code,
    filename: options.filename,
  })
}

export function compileCodeSplitVirtualRoute(
  options: SourceOptions & {
    splitTargets: Array<SplitRouteIdentNodes>
    filename: string
    sharedBindings?: Set<string>
    compilerPlugins?: Array<CodeSplitCompilerPlugin>
  },
) {
  const analysis = sourceAnalysis(options)
  const { program, originalNodes, copies, renameBinding } =
    createOutput(analysis)
  if (!analysis.routes.some((route) => route.factory === 'createFileRoute')) {
    return generateModule(program, {
      source: options.code,
      filename: options.filename,
    })
  }
  const generatedExports: Array<ProgramStatement> = []
  for (const route of analysis.routes) {
    if (route.factory !== 'createFileRoute') {
      continue
    }
    for (const property of properties(route)) {
      if (!isDataProperty(property)) {
        continue
      }
      const key = getObjectPropertyKeyName(property) as SplitRouteIdentNodes
      if (!options.splitTargets.includes(key) || isFallback(property.value)) {
        continue
      }
      const propertyValue = unwrapExpression(property.value)
      const symbol = is.Identifier(propertyValue)
        ? analysis.module.symbolOf(propertyValue)
        : null
      if (symbol && analysis.exported.has(symbol)) {
        continue
      }
      const value = copies.get(propertyValue) as Expression
      const meta = splitMeta(key)
      if (is.Identifier(value)) {
        const declaration = symbol
          ? analysis.graph.declarations.get(symbol)
          : undefined
        const splitNode = declaration ? copies.get(declaration) : undefined
        if (splitNode) {
          for (const plugin of options.compilerPlugins ?? []) {
            plugin.onVirtualRouteSplitNode?.({
              program,
              renameBinding,
              splitNode,
              splitNodeMeta: meta,
            })
          }
        }
        generatedExports.push(
          exports([
            { local: value.name, exported: key, symbol: symbol ?? undefined },
          ]),
        )
      } else {
        const name = getUniqueProgramIdentifier(
          program,
          meta.localExporterIdent,
        ).name
        generatedExports.push(
          variable(name, value),
          exports([{ local: name, exported: key }]),
        )
      }
    }
    ;(copies.get(route.options) as ObjectExpression).properties = []
  }
  // A split module imports user exports, including the Route singleton, from the
  // reference module instead of initializing a second copy.
  const userExports = new Set(
    [...analysis.exported.keys()].map((symbol) => symbol.name),
  )
  program.body = program.body.flatMap((statement): Array<ProgramStatement> => {
    if (is.ExportNamedDeclaration(statement)) {
      return statement.declaration ? [statement.declaration] : []
    }
    if (is.ExportDefaultDeclaration(statement)) {
      return is.FunctionDeclaration(statement.declaration) ||
        is.ClassDeclaration(statement.declaration)
        ? [statement.declaration]
        : []
    }
    if (is.ExportAllDeclaration(statement)) {
      return []
    }
    return [statement]
  })
  removeDeclarations(program, userExports)
  const retainedExports = [...analysis.exported].filter(
    ([symbol]) => !options.sharedBindings?.has(symbol.name),
  )
  if (retainedExports.length) {
    prepend(
      program,
      imports(
        retainedExports.map(([symbol, names]) => ({
          local: symbol.name,
          imported: names[0]!,
        })),
        bareFilename(options.filename),
      ),
    )
  }
  addSharedImports(program, options.sharedBindings, options.filename)
  program.body.push(...generatedExports)
  removeUnusedBindings(analysis.module, program, originalNodes)
  stripUnownedExpressions(analysis.module, program, originalNodes)
  return generateModule(program, {
    source: options.code,
    filename: options.filename,
  })
}

function stripUnownedExpressions(
  module: Module,
  program: Program,
  originalNodes: WeakMap<Node, Node>,
) {
  const localNames = new Set<string>()
  for (const statement of program.body) {
    if (is.VariableDeclaration(statement)) {
      for (const declaration of statement.declarations) {
        for (const id of bindingIdentifiers(declaration.id)) {
          localNames.add(id.name)
        }
      }
    } else if (
      (is.FunctionDeclaration(statement) || is.ClassDeclaration(statement)) &&
      statement.id
    ) {
      localNames.add(statement.id.name)
    }
  }
  program.body = program.body.filter((statement) => {
    if (is.Directive(statement) || !is.ExpressionStatement(statement)) {
      return true
    }
    const original = originalNodes.get(statement)
    return (
      !!original &&
      [...collectModuleReferences(module, original)].some((symbol) =>
        localNames.has(symbol.name),
      )
    )
  })
  if (program.body.every((statement) => is.Directive(statement))) {
    program.body = []
  }
}

export function compileCodeSplitSharedRoute(
  options: SourceOptions & { sharedBindings: Set<string>; filename: string },
) {
  const analysis = sourceAnalysis(options)
  const { program, originalNodes } = createOutput(analysis)
  const keep = expandTransitively(
    new Set(
      analysis.module.rootScope.bindings.filter(
        (symbol) =>
          symbol.name !== 'Route' && options.sharedBindings.has(symbol.name),
      ),
    ),
    analysis.graph.dependencies,
  )
  const names = new Set([...keep].map((symbol) => symbol.name))
  const remove = new Set(
    analysis.module.rootScope.bindings
      .filter((symbol) => !names.has(symbol.name))
      .map((symbol) => symbol.name),
  )
  program.body = program.body.flatMap((statement): Array<ProgramStatement> => {
    if (is.ExportNamedDeclaration(statement)) {
      return statement.declaration ? [statement.declaration] : []
    }
    if (is.ExportDefaultDeclaration(statement)) {
      return is.FunctionDeclaration(statement.declaration) ||
        is.ClassDeclaration(statement.declaration)
        ? [statement.declaration]
        : []
    }
    if (is.ExportAllDeclaration(statement)) {
      return []
    }
    if (
      !is.Declaration(statement) &&
      !is.ImportDeclaration(statement) &&
      !is.Directive(statement)
    ) {
      return []
    }
    return [statement]
  })
  removeDeclarations(program, remove)
  program.body.push(
    exports(
      [...options.sharedBindings]
        .sort()
        .map((name) => ({ local: name, exported: name })),
    ),
  )
  removeUnusedBindings(analysis.module, program, originalNodes, {
    preserveInitiallyUnused: false,
  })
  return generateModule(program, {
    source: options.code,
    filename: options.filename,
  })
}

export function detectCodeSplitGroupingsFromRoute(options: SourceOptions): {
  groupings: CodeSplitGroupings | undefined
} {
  const analysis = sourceAnalysis(options)
  for (const route of analysis.routes) {
    if (
      route.factory !== 'createFileRoute' &&
      route.factory !== 'createRoute'
    ) {
      continue
    }
    for (const property of properties(route)) {
      if (getObjectPropertyKeyName(property) !== 'codeSplitGroupings') {
        continue
      }
      const value = unwrapExpression(property.value)
      if (!is.ArrayExpression(value)) {
        throw new Error(
          'You must provide an array of arrays for the codeSplitGroupings.',
        )
      }
      return {
        groupings: value.elements.map((element) => {
          const group = is.Expression(element)
            ? unwrapExpression(element)
            : element
          if (!is.ArrayExpression(group)) {
            throw new Error(
              'You must provide arrays with codeSplitGroupings options.',
            )
          }
          return group.elements.map((element) => {
            const item = is.Expression(element)
              ? unwrapExpression(element)
              : element
            if (!is.Literal(item) || typeof item.value !== 'string') {
              throw new Error(
                'You must provide a string literal for the codeSplitGroupings',
              )
            }
            return item.value as SplitRouteIdentNodes
          })
        }),
      }
    }
  }
  return { groupings: undefined }
}

function createNotExportableMessage(
  filename: string,
  identifiers: Set<string>,
) {
  return [
    `[tanstack-router] These exports from "${filename}" will not be code-split and will increase your bundle size:`,
    ...[...identifiers].map((name) => `- ${name}`),
    'For the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.',
  ].join('\n')
}
