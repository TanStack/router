import { b, bindingIdentifiers, is, isIdentifierName, walk } from 'yuku-ast'
import { BindingFlags } from 'yuku-analyzer'
import {
  analyzeModule,
  collectModuleReferences,
  createIdentifier,
  expandTransitively,
  filePragmas,
  generateModule,
  generatedReferenceOf,
  keepFilePragmas,
  linkGeneratedReference,
  moduleDeclarationGraph,
  parseStatements,
  prepareBindingCleanup,
  prependStatements,
  removeUnusedBindings,
  unwrapExport,
  unwrapExpression,
} from '@tanstack/router-utils'
import { tsrShared, tsrSplit } from '../constants'
import { createRouteHmrStatement } from '../hmr'
import { getObjectPropertyKeyName, getUniqueProgramIdentifier } from '../utils'
import { getFrameworkOptions } from './framework-options'
import type { Binding, Module } from 'yuku-analyzer'
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

/**
 * The analysis of a route file, which serves one output: the output edits the
 * analyzed tree in place (see `createOutput`).
 */
export type RouteModuleAnalysis = {
  module: Module
  routes: Array<RouteDefinition>
  /**
   * The route of the module, which route HMR updates: the one the exported
   * `Route` holds, else the first one.
   */
  moduleRoute: RouteDefinition | undefined
  /**
   * The module's `Route` is not created by a module-scope factory call, but a
   * function or block calls a route factory: it creates the module's route,
   * which can be neither split nor updated by route HMR.
   */
  routeCreatedInFunction: boolean
  graph: ReturnType<typeof moduleDeclarationGraph>
  /**
   * Declaration dependencies without the `Route` singleton. Split and shared
   * modules import `Route` rather than declare it, so reading it never brings
   * the dependencies of every route option along.
   */
  chunkDependencies: Map<Binding, Set<Binding>>
  exported: Map<Binding, Array<string>>
}

type SourceOptions = AnalyzeModuleOptions & { analysis?: RouteModuleAnalysis }

function resolveExpression(
  module: Module,
  node: Node | null | undefined,
  seen = new Set<Binding>(),
): Node | undefined {
  if (!node) {
    return undefined
  }
  node = unwrapExpression(node)
  if (is.Identifier(node)) {
    const binding = module.bindingOf(node)
    if (!binding || seen.has(binding)) {
      return undefined
    }
    seen.add(binding)
    let declaration: Node | null | undefined = binding.declarations[0]
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
  const { exports: moduleExports } = module
  const routeIdentifier = moduleExports.find(
    (entry) => entry.name === 'Route' && !entry.typeOnly,
  )?.local?.declarations[0]
  const routeDeclarator = routeIdentifier && module.parentOf(routeIdentifier)
  const routeInit = is.VariableDeclarator(routeDeclarator)
    ? routeDeclarator.init && unwrapExpression(routeDeclarator.init)
    : undefined
  let moduleRoute: RouteDefinition | undefined
  // A factory call inside a function or block, and one at module scope that
  // initializes the exported `Route`
  let nestedFactoryCall: Node | undefined
  let routeFactoryCall: Node | undefined
  const seen = new Set<Node>()
  module.walk({
    CallExpression(node, ctx) {
      const outerCallee = unwrapExpression(node.callee)
      const callee = unwrapExpression(
        is.CallExpression(outerCallee) ? outerCallee.callee : outerCallee,
      )
      if (!is.Identifier(callee) || !factoryNames.has(callee.name)) {
        return
      }
      // A factory call inside a function or block can close over local
      // bindings, so its options cannot be split or hoisted to module scope.
      if (module.scopeOf(node) !== module.rootScope) {
        nestedFactoryCall ??= node
        return
      }
      const ancestors = ctx.ancestors()
      if (routeDeclarator && ancestors.includes(routeDeclarator)) {
        routeFactoryCall ??= node
      }
      // The top-level statement, the ancestor after the program
      const statement = ancestors[1] ?? node
      const options = resolveExpression(module, node.arguments[0])
      if (!is.ObjectExpression(options) || seen.has(options)) {
        return
      }
      seen.add(options)
      const route = { options, factory: callee.name, statement }
      routes.push(route)
      if (node === routeInit) {
        moduleRoute = route
      }
    },
  })
  const exported = new Map<Binding, Array<string>>()
  for (const entry of moduleExports) {
    if (entry.local && entry.name !== null && !entry.typeOnly) {
      const names = exported.get(entry.local) ?? []
      if (!names.includes(entry.name)) {
        names.push(entry.name)
      }
      exported.set(entry.local, names)
    }
  }
  const graph = moduleDeclarationGraph(module)
  const chunkDependencies = new Map<Binding, Set<Binding>>()
  for (const [binding, dependencies] of graph.dependencies) {
    if (binding.name !== 'Route') {
      chunkDependencies.set(
        binding,
        new Set(
          [...dependencies].filter((dependency) => dependency.name !== 'Route'),
        ),
      )
    }
  }
  return {
    module,
    routes,
    moduleRoute: moduleRoute ?? routes[0],
    routeCreatedInFunction: !!nestedFactoryCall && !routeFactoryCall,
    graph,
    chunkDependencies,
    exported,
  }
}

function sourceAnalysis(options: SourceOptions) {
  return options.analysis ?? analyzeRouteModule(options)
}

function isFallback(value: Expression) {
  value = unwrapExpression(value)
  return (
    is.NullLiteral(value) ||
    is.BooleanLiteral(value) ||
    (is.Identifier(value) && value.name === 'undefined')
  )
}

function properties(route: RouteDefinition) {
  return route.options.properties.filter(
    (property): property is ObjectProperty => is.Property(property),
  )
}

/** The properties the runtime object keeps: a later duplicate key wins. */
function runtimeProperties(route: RouteDefinition) {
  const all = properties(route)
  return all.filter((property, index) => {
    const key = getObjectPropertyKeyName(property)
    return (
      !key ||
      !all
        .slice(index + 1)
        .some((later) => getObjectPropertyKeyName(later) === key)
    )
  })
}

function isDataProperty(property: ObjectProperty) {
  return !property.method && property.kind === 'init'
}

/**
 * The property whose value a split moves into its chunk: the route option
 * itself, or the `handler` of a loader in object form, since the router reads
 * the other keys of that object (`staleReloadMode`) from the route options.
 * Undefined when the option keeps its value in the route module.
 */
function splitProperty(key: string, property: ObjectProperty) {
  const value = unwrapExpression(property.value)
  if (key !== 'loader' || !is.ObjectExpression(value)) {
    return property
  }
  // The last `handler` wins, unless a spread or a computed key may override it
  for (let index = value.properties.length - 1; index >= 0; index--) {
    const candidate = value.properties[index]!
    if (!is.Property(candidate) || candidate.computed) {
      return undefined
    }
    if (getObjectPropertyKeyName(candidate) === 'handler') {
      return isDataProperty(candidate) && !isFallback(candidate.value)
        ? candidate
        : undefined
    }
  }
  return undefined
}

/** Assign each initializer and its dependencies to the chunks that consume it. */
export function computeSharedBindings(
  options: SourceOptions & { codeSplitGroupings: CodeSplitGroupings },
): Set<string> {
  const analysis = sourceAnalysis(options)
  const { module, graph, chunkDependencies } = analysis
  const groupsByBinding = new Map<Binding, Set<number>>()
  // Only a top-level declaration with a runtime value can move to the shared
  // module: an ambient one is provided by the environment and erased with types
  const locals = new Set(
    [...graph.declarations.keys()].filter(
      (binding) =>
        binding.name !== 'Route' &&
        !binding.has(BindingFlags.Import | BindingFlags.Ambient),
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
      const split = group === -1 ? undefined : splitProperty(key, property)
      // What stays in the route module belongs to the reference group (-1)
      const parts: Array<[Node, number]> =
        split === property
          ? [[property.value, group]]
          : !split
            ? [[property.value, -1]]
            : [
                [split.value, group],
                ...(
                  unwrapExpression(property.value) as ObjectExpression
                ).properties
                  .filter((other) => other !== split)
                  .map((other): [Node, number] => [other, -1]),
              ]
      for (const [node, partGroup] of parts) {
        const references = expandTransitively(
          collectModuleReferences(module, node),
          chunkDependencies,
        )
        for (const binding of references) {
          if (!locals.has(binding)) {
            continue
          }
          const groups = groupsByBinding.get(binding) ?? new Set<number>()
          groups.add(partGroup)
          groupsByBinding.set(binding, groups)
        }
      }
    }
  }
  const shared = new Set<Binding>()
  for (const [binding, groups] of groupsByBinding) {
    if (groups.size > 1) {
      shared.add(binding)
    }
  }
  // A destructured initializer belongs to one module even when its individual
  // bindings are used in different chunks.
  for (const siblings of graph.declarationBindings.values()) {
    const groups = new Set(
      [...siblings].flatMap((binding) => [
        ...(groupsByBinding.get(binding) ?? []),
      ]),
    )
    if (
      groups.size > 1 ||
      [...siblings].some((binding) => shared.has(binding))
    ) {
      for (const binding of siblings) {
        if (locals.has(binding)) {
          shared.add(binding)
        }
      }
    }
  }
  const forbidden = new Set(
    module.rootScope.bindings.filter((binding) => binding.name === 'Route'),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const [binding, dependencies] of graph.dependencies) {
      if (
        !forbidden.has(binding) &&
        [...dependencies].some((dependency) => forbidden.has(dependency))
      ) {
        forbidden.add(binding)
        changed = true
      }
    }
    for (const siblings of graph.declarationBindings.values()) {
      if ([...siblings].some((binding) => forbidden.has(binding))) {
        for (const binding of siblings) {
          if (!forbidden.has(binding)) {
            forbidden.add(binding)
            changed = true
          }
        }
      }
    }
  }
  return new Set(
    [...shared]
      .filter((binding) => !forbidden.has(binding))
      .map((binding) => binding.name),
  )
}

function identifier(name: string) {
  return b.Identifier({ name })
}
function reference(name: string, binding?: Binding) {
  const node = identifier(name)
  linkGeneratedReference(node, binding ?? name)
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
  names: Array<{ local: string; exported: string; binding?: Binding }>,
  source: string | null = null,
) {
  return b.ExportNamedDeclaration({
    declaration: null,
    source: source === null ? null : string(source),
    attributes: [],
    specifiers: names.map(({ local, exported, binding }) =>
      b.ExportSpecifier({
        local: source === null ? reference(local, binding) : moduleName(local),
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

type RouteModuleOutput = ReturnType<typeof createOutput>

/** Print a module emitted for a route file, led by the file's pragmas. */
function generateRouteModule(
  analysis: RouteModuleAnalysis,
  output: RouteModuleOutput,
  filename: string,
) {
  keepFilePragmas(output.pragmas, output.program)
  return generateModule(output.program, {
    source: analysis.module.source,
    filename,
  })
}

/**
 * The output edits the analyzed tree in place, so an analysis serves one
 * output. Its semantic tables are keyed by node identity and read from Yuku's
 * buffer, so they describe the source whatever the output does to the tree.
 * What is read from the tree's structure is read here, before the first edit.
 */
function createOutput(analysis: RouteModuleAnalysis) {
  const { module } = analysis
  const program = module.ast
  const cleanup = prepareBindingCleanup(module)
  const pragmas = filePragmas(program)
  const reservedNames = new Set([
    ...module.bindings.map((binding) => binding.name),
    ...module.unresolvedReferences.map((reference) => reference.name),
  ])
  // Most outputs never rename a binding: build the index on first use
  let declarationExports: Map<Node, typeof analysis.module.exports> | undefined
  const renameBinding = (node: Node, name: string) => {
    const binding = module.bindingOf(node)
    if (!binding) {
      return
    }
    if (!declarationExports) {
      declarationExports = new Map()
      for (const entry of analysis.module.exports) {
        if (!entry.local || entry.name === null || entry.typeOnly) {
          continue
        }
        // The top-level statement, the last ancestor before the program
        let statement: Node = entry.node
        for (const ancestor of module.ancestors(entry.node)) {
          if (is.Program(ancestor)) {
            break
          }
          statement = ancestor
        }
        if (is.ExportNamedDeclaration(statement) && statement.declaration) {
          const entries = declarationExports.get(statement) ?? []
          declarationExports.set(statement, [...entries, entry])
        }
      }
    }
    const aliasedNames = new Set<string>()
    for (const [statement, entries] of declarationExports) {
      if (
        !entries.some((entry) => entry.local === binding) ||
        !is.ExportNamedDeclaration(statement) ||
        !statement.declaration
      ) {
        continue
      }
      const index = program.body.indexOf(statement)
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
            binding: entry.local!,
          })),
        )
        program.body.splice(
          index,
          1,
          statement.declaration,
          ...(uniqueEntries.length ? [aliases] : []),
        )
      }
    }
    walk(program, {
      enter(candidate, context) {
        if (!is.Identifier(candidate) && !is.JSXIdentifier(candidate)) {
          return
        }
        // The aliases above reference the binding they export
        if (
          module.bindingOf(candidate) === binding ||
          generatedReferenceOf(candidate) === binding
        ) {
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
  const removeUnused = () => removeUnusedBindings(module, program, cleanup)
  return { program, pragmas, reservedNames, renameBinding, removeUnused }
}

/** Split modules export only their own split values; keep local declarations. */
function withoutExportSyntax(
  statement: ProgramStatement,
): Array<ProgramStatement> {
  if (is.ExportNamedDeclaration(statement)) {
    return statement.declaration
      ? [unwrapExport(statement, statement.declaration)]
      : []
  }
  if (is.ExportDefaultDeclaration(statement)) {
    const { declaration } = statement
    // An anonymous default declaration has no binding that could be used here
    return (is.FunctionDeclaration(declaration) ||
      is.ClassDeclaration(declaration)) &&
      declaration.id
      ? [unwrapExport(statement, declaration)]
      : []
  }
  if (is.ExportAllDeclaration(statement)) {
    return []
  }
  return [statement]
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
    VariableDeclaration(node, context) {
      if (
        is.Program(context.parent) ||
        is.ExportNamedDeclaration(context.parent)
      ) {
        node.declarations = node.declarations.filter(
          (declarator) =>
            !bindingIdentifiers(declarator.id).every((id) =>
              names.has(id.name),
            ),
        )
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
    prependStatements(
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
  const { program, reservedNames, renameBinding } = output
  const framework = getFrameworkOptions(options.targetFramework)
  const lazyImports = new Map<string, string>()
  const knownExported = new Set<string>()
  let modified = false
  for (const route of analysis.routes) {
    const routeOptions = route.options
    const insertionStatement = route.statement as ProgramStatement
    const context: ReferenceRouteCompilerPluginContext = {
      program,
      module: analysis.module,
      graph: analysis.graph,
      reservedNames,
      renameBinding,
      routeOptions,
      createRouteFn: route.factory,
      opts: options,
      insertBefore(nodes) {
        // renameBinding unwraps an `export` declaration it renames
        const index = program.body.findIndex(
          (statement) =>
            statement === insertionStatement ||
            (is.ExportNamedDeclaration(insertionStatement) &&
              statement === insertionStatement.declaration),
        )
        program.body.splice(index, 0, ...nodes)
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
        const target = splitProperty(key, prop)
        if (!target) {
          continue
        }
        const splitValue = unwrapExpression(target.value)
        const binding = is.Identifier(splitValue)
          ? analysis.module.bindingOf(splitValue)
          : null
        if (binding && analysis.exported.has(binding)) {
          knownExported.add(binding.name)
          continue
        }
        const meta = splitMeta(key)
        let lazy = lazyImports.get(meta.splitStrategy)
        if (!lazy) {
          lazy = getUniqueProgramIdentifier(
            reservedNames,
            meta.splitStrategy,
          ).name
          prependStatements(
            program,
            imports(
              [{ local: lazy, imported: meta.splitStrategy }],
              framework.package,
            ),
          )
          lazyImports.set(meta.splitStrategy, lazy)
        }
        meta.localImporterIdent = getUniqueProgramIdentifier(
          reservedNames,
          meta.localImporterIdent,
        ).name
        prependStatements(
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
              prop: target,
              splitNodeMeta: meta,
              lazyRouteComponentIdent: lazy,
            }) ?? undefined
          if (value) {
            break
          }
        }
        target.value =
          value ??
          call(lazy, [
            reference(meta.localImporterIdent),
            string(meta.exporterIdent),
          ])
        target.shorthand = false
        modified = true
      }
    } else {
      for (const plugin of options.compilerPlugins ?? []) {
        modified = !!plugin.onUnsplittableRoute?.(context)?.modified || modified
      }
    }
    if (options.addHmr && route === analysis.moduleRoute) {
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
    .filter(([binding]) => options.sharedBindings?.has(binding.name))
    .flatMap(([binding, names]) =>
      names.map((name) => ({ local: binding.name, exported: name })),
    )
  if (sharedExports.length) {
    program.body.push(
      exports(sharedExports, addSharedSearchParamToFilename(options.filename)),
    )
  }
  output.removeUnused()
  if (knownExported.size) {
    const message = createNotExportableMessage(options.filename, knownExported)
    console.warn(message)
    if (process.env.NODE_ENV !== 'production') {
      prependStatements(
        program,
        ...parseStatements(`console.warn(${JSON.stringify(message)})`),
      )
    }
  }
  return generateRouteModule(analysis, output, options.filename)
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
  const output = createOutput(analysis)
  const { program, reservedNames, renameBinding } = output
  if (!analysis.routes.some((route) => route.factory === 'createFileRoute')) {
    return generateRouteModule(analysis, output, options.filename)
  }
  // What the source's expression statements reference, before edits
  const statementReferences = new Map(
    program.body
      .filter((statement) => is.ExpressionStatement(statement))
      .map((statement) => [
        statement,
        collectModuleReferences(analysis.module, statement),
      ]),
  )
  const generatedExports: Array<ProgramStatement> = []
  const splitReferences = new Set<Binding>()
  for (const route of analysis.routes) {
    if (route.factory !== 'createFileRoute') {
      continue
    }
    for (const property of runtimeProperties(route)) {
      if (!isDataProperty(property)) {
        continue
      }
      const key = getObjectPropertyKeyName(property) as SplitRouteIdentNodes
      if (!options.splitTargets.includes(key) || isFallback(property.value)) {
        continue
      }
      const target = splitProperty(key, property)
      if (!target) {
        continue
      }
      const value = unwrapExpression(target.value)
      const binding = is.Identifier(value)
        ? analysis.module.bindingOf(value)
        : null
      if (binding && analysis.exported.has(binding)) {
        continue
      }
      for (const reference of collectModuleReferences(analysis.module, value)) {
        splitReferences.add(reference)
      }
      const meta = splitMeta(key)
      if (is.Identifier(value)) {
        const splitNode = binding
          ? analysis.graph.declarations.get(binding)
          : undefined
        if (splitNode) {
          for (const plugin of options.compilerPlugins ?? []) {
            plugin.onVirtualRouteSplitNode?.({
              program,
              reservedNames,
              renameBinding,
              splitNode,
              splitNodeMeta: meta,
            })
          }
        }
        generatedExports.push(
          exports([
            { local: value.name, exported: key, binding: binding ?? undefined },
          ]),
        )
      } else {
        const name = getUniqueProgramIdentifier(
          reservedNames,
          meta.localExporterIdent,
        ).name
        generatedExports.push(
          variable(name, value),
          exports([{ local: name, exported: key }]),
        )
      }
    }
    route.options.properties = []
  }
  const importedExports = exportsImportedBySplitModule(
    analysis,
    splitReferences,
    options.sharedBindings,
  )
  program.body = program.body.flatMap(withoutExportSyntax)
  removeDeclarations(
    program,
    new Set(importedExports.map(([binding]) => binding.name)),
  )
  if (importedExports.length) {
    prependStatements(
      program,
      imports(
        importedExports.map(([binding, names]) => ({
          local: binding.name,
          imported: names[0]!,
        })),
        bareFilename(options.filename),
      ),
    )
  }
  addSharedImports(program, options.sharedBindings, options.filename)
  program.body.push(...generatedExports)
  output.removeUnused()
  stripUnownedExpressions(program, statementReferences)
  return generateRouteModule(analysis, output, options.filename)
}

/**
 * User exports, including the Route singleton, that a split module imports from
 * the reference module instead of initializing a second copy. Imports keep their
 * source, a destructuring that also declares private bindings stays whole, and
 * shared bindings come from the shared module. Exported variables are always
 * imported so that every module sees one context or store instance. An
 * exported function or class that depends on a private binding the split
 * module declares itself is declared alongside it, so that both observe one
 * module state.
 */
function exportsImportedBySplitModule(
  analysis: RouteModuleAnalysis,
  splitReferences: Set<Binding>,
  sharedBindings: Set<string> | undefined,
) {
  const { graph, exported, chunkDependencies } = analysis
  const siblingsOf = (binding: Binding) => {
    const declaration = graph.declarations.get(binding)
    return declaration ? graph.declarationBindings.get(declaration) : undefined
  }
  const isShared = (binding: Binding) => !!sharedBindings?.has(binding.name)
  const dependenciesUntil = (stop: (binding: Binding) => boolean) =>
    new Map([...chunkDependencies].filter(([binding]) => !stop(binding)))
  const privateDependencies = dependenciesUntil(isShared)
  const imported = new Set(
    [...exported.keys()].filter((binding) => {
      const siblings = siblingsOf(binding)
      return (
        !binding.has(BindingFlags.Import) &&
        !isShared(binding) &&
        !!siblings &&
        [...siblings].every((sibling) => exported.has(sibling))
      )
    }),
  )
  let changed = true
  while (changed) {
    changed = false
    const declared = expandTransitively(
      splitReferences,
      dependenciesUntil(
        (binding) => imported.has(binding) || isShared(binding),
      ),
    )
    for (const binding of imported) {
      // Every module reads one instance of an exported variable
      if (is.VariableDeclarator(graph.declarations.get(binding))) {
        continue
      }
      const dependencies = expandTransitively(
        chunkDependencies.get(binding) ?? new Set<Binding>(),
        privateDependencies,
      )
      if (
        [...dependencies].some(
          (dependency) =>
            declared.has(dependency) &&
            graph.declarations.has(dependency) &&
            !dependency.has(BindingFlags.Import) &&
            !imported.has(dependency) &&
            !isShared(dependency),
        )
      ) {
        for (const sibling of siblingsOf(binding)!) {
          imported.delete(sibling)
        }
        changed = true
      }
    }
  }
  return [...exported].filter(([binding]) => imported.has(binding))
}

function stripUnownedExpressions(
  program: Program,
  statementReferences: Map<Node, Set<Binding>>,
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
    } else if (is.TSEnumDeclaration(statement) && !statement.declare) {
      localNames.add(statement.id.name)
    } else if (is.TSModuleDeclaration(statement) && !statement.declare) {
      // `namespace A.B {}` declares `A`
      let id: Node = statement.id
      while (is.TSQualifiedName(id)) {
        id = id.left
      }
      if (is.Identifier(id)) {
        localNames.add(id.name)
      }
    }
  }
  program.body = program.body.filter((statement) => {
    if (is.Directive(statement) || !is.ExpressionStatement(statement)) {
      return true
    }
    const references = statementReferences.get(statement)
    return (
      !!references &&
      [...references].some((binding) => localNames.has(binding.name))
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
  const output = createOutput(analysis)
  const { program } = output
  const keep = expandTransitively(
    new Set(
      analysis.module.rootScope.bindings.filter(
        (binding) =>
          binding.name !== 'Route' && options.sharedBindings.has(binding.name),
      ),
    ),
    analysis.graph.dependencies,
  )
  const names = new Set([...keep].map((binding) => binding.name))
  const remove = new Set(
    analysis.module.rootScope.bindings
      .filter((binding) => !names.has(binding.name))
      .map((binding) => binding.name),
  )
  program.body = program.body
    .flatMap(withoutExportSyntax)
    .filter(
      (statement) =>
        is.Declaration(statement) ||
        is.ImportDeclaration(statement) ||
        is.Directive(statement),
    )
  removeDeclarations(program, remove)
  program.body.push(
    exports(
      [...options.sharedBindings]
        .sort()
        .map((name) => ({ local: name, exported: name })),
    ),
  )
  output.removeUnused()
  return generateRouteModule(analysis, output, options.filename)
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
          const group = unwrapExpression(element)
          if (!is.ArrayExpression(group)) {
            throw new Error(
              'You must provide arrays with codeSplitGroupings options.',
            )
          }
          return group.elements.map((element) => {
            const item = unwrapExpression(element)
            if (!is.StringLiteral(item)) {
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

export function createRouteInFunctionMessage(filename: string) {
  return `[tanstack-router] The route in "${filename}" is created inside a function. Route factories are not supported, so it will not be code-split, and edits to its components may need a full page reload. Create it at module level: export const Route = createFileRoute('/path')({ ... })`
}
