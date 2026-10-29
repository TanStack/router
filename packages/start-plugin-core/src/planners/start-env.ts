/**
 * The `start-env` planner (J4): Start's environment
 * separation on the core's plan. Server fns become client/SSR stubs, or
 * keep their chain next to a generated `createServerRpc` export in the
 * provider; an in-place provider (SSR) moves the handlers into one derived
 * handler module it imports on the first call (what only handlers read
 * loads then, once; everything else stays and is imported back);
 * middleware links, isomorphic implementations and env-only fns are
 * selected per env; `<ClientOnly>` children leave server envs; nested
 * server fns are hoisted on the server when that is safe, else refused at
 * the capture. Everything the removed code alone referenced is dropped by
 * the core's provenance-based placement; function-local declarators and
 * destructured bindings only removed code read, by the core's
 * `cleanOrphanedDeclarations`.
 */
import {
  cleanOrphanedDeclarations,
  identifierBase,
  isPureExpression,
  revision,
  siblingSpecifier,
  stringLiteral,
  unwrapExpression,
  walk,
} from '@tanstack/router-utils/compiler'
import { runtimeSpecifiers, startRecognizer } from '../compiler/recognizer'
import { prefetchStartValues } from '../compiler/prefetch'
import { startAnalysisOf } from '../compiler/start-analysis'
import {
  defaultFunctionId,
  devFunctionId,
  placeholderId,
} from '../server-fns/ids'
import type { Chain } from '../compiler/start-analysis'
import type { ServerFnFact } from '../server-fns/registry'
import type {
  EditScope,
  Frag,
  GenUnitId,
  YukuNode as Node,
  OutputId,
  PlanContext,
  Planner,
  Range,
  SymbolId,
  Unit,
} from '@tanstack/router-utils/compiler'
import type { CompileStartFrameworkOptions } from '../types'

export const START_ENV = 'start-env'

export interface StartEnvConfig {
  framework: CompileStartFrameworkOptions
  /** The project root ids and `serverFnMeta.filename` are relative to. */
  root: string
  /**
   * Whether the server-fn provider is a different env than the SSR caller
   * (RSC: the `rsc` environment or layer). Every module defining server fns
   * then gets a derived provider module (`?tss-serverfn-split`): the provider
   * env evaluates only what the server fns need (a route module's client-only
   * module-level code, e.g. `createContext`, fails under `react-server`).
   */
  providerSeparate: boolean
  /** `dev`: opaque dev ids; `default`: hashed ids; `placeholder`: a custom generator decides at renderChunk. */
  idMode: 'dev' | 'default' | 'placeholder'
  /** The directive a derived provider module carries (RSC), if any. */
  providerDirective?: string
  /** Whether resolved ids are opaque packages (never read for summaries). */
  isOpaque?: (resolvedCanonicalId: string) => boolean
}

export interface StartEnvFacts {
  serverFns: Array<ServerFnFact>
}

type Role = 'client' | 'ssr-caller' | 'provider'

const text = (
  ...parts: Array<
    string | { sym: SymbolId; ctx?: 'expr' | 'callee' | 'jsxTag' }
  >
): Frag => ({
  k: 'text',
  parts,
})
const slice = (range: Range): Frag => ({ k: 'slice', range })
const rangeOf = (n: Node): Range => ({ start: n.start, end: n.end })

/** Whether `expr` needs parentheses when it replaces the expression `original` under `parent`. */
function needsParens(
  expr: Node | 'arrow',
  original: Node,
  parent: Node | null,
): boolean {
  if (!parent) {
    return false
  }
  const kind = expr === 'arrow' ? 'ArrowFunctionExpression' : expr.type
  const loose = new Set([
    'Identifier',
    'Literal',
    'CallExpression',
    'MemberExpression',
    'ArrayExpression',
    'TemplateLiteral',
    'ParenthesizedExpression',
    'NewExpression',
    'ThisExpression',
    'JSXElement',
    'JSXFragment',
    'TaggedTemplateExpression',
    'ChainExpression',
  ])
  if (parent.type === 'ExpressionStatement') {
    return (
      kind === 'FunctionExpression' ||
      kind === 'ClassExpression' ||
      kind === 'ObjectExpression'
    )
  }
  if (loose.has(kind)) {
    return false
  }
  switch (parent.type) {
    case 'CallExpression':
    case 'NewExpression':
      return parent.callee === original
    case 'MemberExpression':
      return parent.object === original
    case 'TaggedTemplateExpression':
      return parent.tag === original
    case 'UnaryExpression':
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'AwaitExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
    case 'ConditionalExpression':
      return parent.type !== 'ConditionalExpression' || parent.test === original
    default:
      return false
  }
}

function enclosingFunctionNames(
  file: PlanContext['analysis']['file'],
  node: Node,
): Array<string> {
  const names: Array<string> = []
  for (const a of file.ancestors(node)) {
    switch (a.type) {
      case 'FunctionDeclaration':
        names.unshift(a.id ? a.id.name : 'default')
        break
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const p = file.parentOf(a)
        if (p?.type === 'VariableDeclarator' && p.id.type === 'Identifier') {
          names.unshift(p.id.name)
        } else if (
          p?.type === 'Property' &&
          !p.computed &&
          p.key.type === 'Identifier'
        ) {
          names.unshift(p.key.name)
        } else if (
          p?.type === 'MethodDefinition' &&
          !p.computed &&
          p.key.type === 'Identifier'
        ) {
          names.unshift(p.key.name)
        } else if (a.type === 'FunctionExpression' && a.id) {
          names.unshift(a.id.name)
        }
        break
      }
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (a.id) {
          names.unshift(a.id.name)
        }
        break
      default:
        break
    }
  }
  return names
}

interface ServerFnSite {
  chain: Chain
  handler: Node
  base: string
  stableKey: string
  /** The declared top-level symbol when the chain initialises a top-level declarator. */
  topLevelSym: SymbolId | null
  topLevelUnit: Unit | null
  nested: boolean
  exportName: string | null
}

function describeServerFn(
  ctx: PlanContext,
  chain: Chain,
): {
  base: string
  nested: boolean
  topLevelSym: SymbolId | null
  topLevelUnit: Unit | null
  exportName: string | null
  destructured: Node | null
  path: Array<string>
} {
  const file = ctx.analysis.file
  const { t1, symbols } = ctx
  let node: Node = chain.wrapped
  let p = chain.parent
  const hop = () => {
    node = p!
    p = file.parentOf(node)
    while (
      p &&
      (p.type === 'ParenthesizedExpression' ||
        p.type === 'TSAsExpression' ||
        p.type === 'TSSatisfiesExpression' ||
        p.type === 'TSNonNullExpression' ||
        p.type === 'TSTypeAssertion' ||
        p.type === 'TSInstantiationExpression' ||
        p.type === 'ChainExpression')
    ) {
      node = p
      p = file.parentOf(p)
    }
  }
  let direct = true
  for (;;) {
    if (!p) {
      break
    }
    if (p.type === 'CallExpression' && p.callee !== node) {
      direct = false
      hop()
      continue
    }
    if (
      (p.type === 'ConditionalExpression' && p.test !== node) ||
      p.type === 'LogicalExpression' ||
      p.type === 'SequenceExpression' ||
      p.type === 'AwaitExpression'
    ) {
      direct = false
      hop()
      continue
    }
    break
  }
  let base = ''
  let topLevelSym: SymbolId | null = null
  let topLevelUnit: Unit | null = null
  let destructured: Node | null = null
  if (p) {
    switch (p.type) {
      case 'VariableDeclarator':
        if (p.id.type === 'Identifier') {
          base = p.id.name
          const b = file.bindingOf(p.id)
          if (b && direct && b.scope === file.rootScope) {
            const sym = symbols.ofBinding(b)
            const units = t1.declaringUnits.get(sym)
            if (units && units.length > 0) {
              topLevelSym = sym
              topLevelUnit = t1.units[units[0]!]!
            }
          }
        } else if (direct) {
          destructured = p.id
        }
        break
      case 'Property':
        if (!p.computed) {
          base =
            p.key.type === 'Identifier'
              ? p.key.name
              : String((p.key as { value?: unknown }).value ?? '')
        }
        break
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (!p.computed && p.key.type === 'Identifier') {
          base = p.key.name
        }
        break
      case 'ExportDefaultDeclaration':
        base = 'default'
        break
      case 'AssignmentExpression':
        if (p.left.type === 'Identifier') {
          base = p.left.name
        } else if (
          p.left.type === 'MemberExpression' &&
          !p.left.computed &&
          p.left.property.type === 'Identifier'
        ) {
          base = p.left.property.name
        }
        break
      default:
        break
    }
  }
  const path = enclosingFunctionNames(file, chain.terminal)
  let exportName: string | null = null
  if (topLevelSym !== null) {
    for (const e of ctx.analysis.exports) {
      if (e.kind === 'local' && e.local === topLevelSym && !e.typeOnly) {
        exportName = e.name
        break
      }
    }
  } else if (base === 'default' && p?.type === 'ExportDefaultDeclaration') {
    exportName = 'default'
  }
  return {
    base,
    nested: topLevelSym === null,
    topLevelSym,
    topLevelUnit,
    exportName,
    destructured,
    path,
  }
}

function roleOf(ctx: PlanContext, config: StartEnvConfig): Role {
  if (ctx.env.type === 'client') {
    return 'client'
  }
  if (ctx.env.isProvider || !config.providerSeparate) {
    return 'provider'
  }
  return 'ssr-caller'
}

export function startEnvPlanner(): Planner {
  const table = startRecognizer()
  return {
    name: START_ENV,
    tier: 1,
    gate: (t0) => t0.hasImportOrExport,
    async prefetch(t0, ctx) {
      const config = ctx.config as StartEnvConfig
      const result = await prefetchStartValues(t0, ctx, {
        table,
        isOpaque: config.isOpaque ?? (() => false),
      })
      ctx.set(result)
      return result.relevant
    },
    plan(ctx) {
      planStartEnv(ctx, ctx.config as StartEnvConfig, table)
    },
  }
}

function planStartEnv(
  ctx: PlanContext,
  config: StartEnvConfig,
  table: ReturnType<typeof startRecognizer>,
): void {
  const analysis = startAnalysisOf(ctx, table)
  const { analysis: ma, t1, names, rewrites } = ctx
  const file = ma.file
  const editsBefore = rewrites.edits.length + rewrites.claims.size
  const role = roleOf(ctx, config)
  const isServer = role !== 'client'
  const by = START_ENV
  /** A provider module accepts its own hot updates in development (J4.15): the handlers are read at the next call. */
  const acceptHotUpdates = (home: OutputId | 'auto', leading: string) =>
    rewrites.addGenerated({
      body: [
        text(
          `${leading}if (import.meta.hot) {\n  import.meta.hot.accept(() => {})\n}\n`,
        ),
      ],
      declares: [],
      effectful: true,
      anchor: { k: 'end' },
      home,
      by,
    })
  const specs = runtimeSpecifiers(config.framework)
  const rootRel = relativeRoot(config.root, ctx.identity.path)
  const facts: StartEnvFacts = { serverFns: [] }

  const diag = (message: string, range: Range) =>
    ctx.diagnostic({ severity: 'error', message, range, by })

  // ---- derived provider output (RSC: the module as the separate provider env compiles it)
  let providerOut: OutputId | null = null
  const serverFnChains = analysis.chains.filter(
    (c) => c.terminalValue.t === 'serverFn' && !c.unsupported,
  )
  const derivesProvider = config.providerSeparate
  if (role === 'provider' && derivesProvider && serverFnChains.length > 0) {
    providerOut = ctx.declareOutput({
      kind: 'provider',
      key: 'provider',
      derived: { kind: 'provider', value: '' },
      header: {
        dropDirectives: ['use client'],
        ...(config.providerDirective
          ? { addDirective: config.providerDirective }
          : {}),
      },
      roots: t1.units
        .filter((u) => u.kind === 'effect' || u.kind === 'import-effect')
        .map((u) => ({ t: 'unit' as const, id: u.id })),
    })
    if (ctx.env.mode === 'dev') {
      acceptHotUpdates(providerOut, '')
    }
  }
  const envScope: EditScope = providerOut ? ['env'] : 'all-outputs'
  const providerScope: EditScope = providerOut ? [providerOut] : 'all-outputs'

  // ---- glue imports, allocated on first use
  const glue = new Map<string, SymbolId>()
  const glueImport = (
    specifier: string,
    imported: string,
    localBase: string,
  ): SymbolId => {
    const key = `${specifier}\u0000${imported}`
    let sym = glue.get(key)
    if (sym === undefined) {
      const alloc = names.alloc(localBase)
      sym = alloc.sym
      rewrites.addGenerated({
        body: [],
        declares: [],
        effectful: false,
        anchor: { k: 'after-header' },
        home: 'auto',
        by,
        imports: [
          {
            names: [{ imported, local: sym }],
            spec: {
              k: 'spec',
              specifier,
              edgeKey: ctx.edgeKey(specifier, 'static', 'runtime'),
              provenance: { origin: 'runtime' },
            },
          },
        ],
      })
      glue.set(key, sym)
    }
    return sym
  }

  // ---- lazy handler module (in-place provider): one per defining module, loaded once on the first call
  let handlerOut: OutputId | null = null
  let handlerLoad: SymbolId | null = null
  const lazyHandlerOutput = (): { out: OutputId; load: SymbolId } => {
    if (handlerOut === null || handlerLoad === null) {
      handlerOut = ctx.declareOutput({
        kind: 'custom',
        key: 'handler',
        derived: { kind: 'handler', value: '' },
      })
      const memo = names.alloc('tsrHandlers')
      const load = names.alloc('tsrLoadHandlers')
      const spec = siblingSpecifier(handlerOut.slice('derived:'.length))
      rewrites.addGenerated({
        body: [
          text(
            'let ',
            { sym: memo.sym },
            '\nconst ',
            { sym: load.sym },
            ' = () => (',
            { sym: memo.sym },
            ' ??= import(',
          ),
          {
            k: 'spec',
            specifier: spec,
            edgeKey: ctx.edgeKey(spec, 'dynamic', 'runtime'),
            provenance: { origin: 'runtime' },
            form: 'dynamic',
          },
          text('))\n'),
        ],
        declares: [memo.sym, load.sym],
        effectful: false,
        anchor: { k: 'after-header' },
        home: 'auto',
        by,
      })
      handlerLoad = load.sym
    }
    return { out: handlerOut, load: handlerLoad }
  }

  // ---- 1. link stripping on the client (serverFn validators, middleware server/validator)
  for (const chain of analysis.chains) {
    if (chain.unsupported) {
      continue
    }
    for (const link of chain.links) {
      const recv = link.receiver
      if (recv.t !== 'builder') {
        continue
      }
      const strip =
        (recv.kind === 'serverFn' &&
          (link.method === 'validator' || link.method === 'inputValidator')) ||
        (recv.kind === 'middleware' &&
          (link.method === 'server' || link.method === 'validator'))
      if (!strip) {
        continue
      }
      if (link.arg === null) {
        diag(
          `.${link.method}() must be called with an argument`,
          rangeOf(link.call),
        )
        continue
      }
      if (role === 'client') {
        rewrites.add({
          range: { start: link.member.object.end, end: link.call.end },
          body: [],
          scope: 'all-outputs',
          by,
        })
      }
    }
  }

  // ---- 2. server fns
  const sites: Array<ServerFnSite> = []
  const keyCount = new Map<string, number>()
  // in source order (the analysis lists chains per import binding): an
  // enclosing handler's site before a nested one, so the nested site is
  // judged against the stub that replaced its handler (a nested server fn
  // inside a stubbed handler is dead there, J4.6), and stable keys follow
  // the source whatever the import order
  for (const chain of [...serverFnChains].sort(
    (a, b) => a.terminal.start - b.terminal.start,
  )) {
    const handlerLink = chain.links.find((l) => l.method === 'handler')
    if (!handlerLink) {
      continue
    }
    const described = describeServerFn(ctx, chain)
    if (described.destructured) {
      diag(
        'createServerFn must be assigned to a simple identifier, not a destructuring pattern',
        rangeOf(described.destructured),
      )
      continue
    }
    if (handlerLink.arg === null) {
      diag(
        'createServerFn must be called with a "handler" function',
        rangeOf(chain.terminal),
      )
      continue
    }
    if (handlerLink.argIsSpread) {
      diag(
        'handler() must be called with a function, not a spread argument',
        rangeOf(handlerLink.arg),
      )
      continue
    }
    const baseKey = `${described.base || 'fn'}${described.path.length > 0 ? `@${described.path.join('/')}` : ''}`
    const n = keyCount.get(baseKey) ?? 0
    keyCount.set(baseKey, n + 1)
    sites.push({
      chain,
      handler: handlerLink.arg,
      base: described.base || 'fn',
      stableKey: n === 0 ? baseKey : `${baseKey}#${n}`,
      topLevelSym: described.topLevelSym,
      topLevelUnit: described.topLevelUnit,
      nested: described.nested,
      exportName: described.exportName,
    })
  }

  /** Handler arguments replaced by stubs: candidates on exactly these ranges are dead there. */
  const stubbedHandlers = new Set<string>()
  if (role !== 'provider' || providerOut) {
    for (const site of sites) {
      stubbedHandlers.add(`${site.handler.start}:${site.handler.end}`)
    }
  }

  // Handlers that move to the lazy handler module (in-place provider). An
  // all-outputs rewrite of exactly such a handler (the handler is itself a
  // createServerOnlyFn / createIsomorphicFn call) travels with it into the
  // handler module (the core nests it inside the claim).
  const lazySites = new Set<ServerFnSite>()
  if (
    role === 'provider' &&
    !providerOut &&
    sites.length > 0 &&
    // a module that awaits at its top level could await one of its own server fns while it
    // evaluates: the handler module imports it back and would wait for it forever
    !hasTopLevelAwait(ctx)
  ) {
    for (const site of sites) {
      // a core fallback (the handler writes module state other code reads) keeps it in place
      if (ctx.fallbackAt(rangeOf(site.handler), 'custom') === undefined) {
        lazySites.add(site)
      }
    }
  }
  /** An environment rewrite: it applies in every output, inside a moved handler too. */
  const envEdit = (range: Range, body: Array<Frag>) => {
    rewrites.add({ range, body, scope: 'all-outputs', by })
  }

  // ---- 3. isomorphic fns
  const wantLink = isServer ? 'server' : 'client'
  for (const chain of analysis.chains) {
    const v = chain.terminalValue
    const isIso = v.t === 'isoFn' || (v.t === 'builder' && v.kind === 'isoFn')
    if (!isIso || chain.unsupported) {
      continue
    }
    const X = chain.terminal
    if (stubbedHandlers.has(`${chain.wrapped.start}:${chain.wrapped.end}`)) {
      continue
    }
    const link = chain.links.find((l) => l.method === wantLink)
    if (link) {
      if (link.arg === null || link.argIsSpread) {
        diag(
          `createIsomorphicFn().${wantLink}(fn) must be called with a function`,
          rangeOf(link.call),
        )
        continue
      }
      const parens = needsParens(
        unwrapExpression(link.arg),
        chain.wrapped,
        chain.parent,
      )
      envEdit(
        rangeOf(X),
        parens
          ? [text('('), slice(rangeOf(link.arg)), text(')')]
          : [slice(rangeOf(link.arg))],
      )
      continue
    }
    if (chain.headIsFactoryCall) {
      const parens = needsParens('arrow', chain.wrapped, chain.parent)
      envEdit(rangeOf(X), [text(parens ? '(() => {})' : '() => {}')])
      continue
    }
    if (chain.links.length > 0) {
      // the implementation lives on the stored receiver (this module or another): strip this segment's links
      envEdit(rangeOf(X), [slice(rangeOf(chain.head))])
    }
  }

  // ---- 4. env-only fns
  for (const c of analysis.envOnlyCalls) {
    if (stubbedHandlers.has(`${c.call.start}:${c.call.end}`)) {
      continue
    }
    const own = (c.kind === 'server') === isServer
    const parent = file.parentOf(c.call)
    const wrapped = c.call
    if (own) {
      if (c.arg === null || c.arg.type === 'SpreadElement') {
        diag(
          `create${c.kind === 'server' ? 'Server' : 'Client'}OnlyFn() must be called with a function`,
          rangeOf(c.call),
        )
        continue
      }
      const parens = needsParens(unwrapExpression(c.arg), wrapped, parent)
      envEdit(
        rangeOf(c.call),
        parens
          ? [text('('), slice(rangeOf(c.arg)), text(')')]
          : [slice(rangeOf(c.arg))],
      )
    } else {
      const message = `create${c.kind === 'server' ? 'Server' : 'Client'}OnlyFn() functions can only be called on the ${c.kind}!`
      const parens = needsParens('arrow', wrapped, parent)
      const stub = `() => { throw new Error(${stringLiteral(message, '"')}) }`
      envEdit(rangeOf(c.call), [text(parens ? `(${stub})` : stub)])
    }
  }

  // ---- 5. <ClientOnly> children on server envs
  if (isServer) {
    for (const el of analysis.clientOnlyElements) {
      if (!el.closingElement) {
        continue
      }
      rewrites.add({
        range: { start: el.openingElement.end - 1, end: el.end },
        body: [text('/>')],
        scope: 'all-outputs',
        by,
      })
    }
  }

  // ---- 2b. server fn rewrites
  let devRevision: string | undefined
  for (const site of sites) {
    const key = { rootRel, stableKey: site.stableKey }
    // a nested server fn is checked for hoistability in every env (J4.6: every env refuses
    // at the capture, or every env supports it); the hoist itself happens on the provider
    let hoisted: ReturnType<typeof hoist> = null
    if (site.nested) {
      hoisted = hoist(ctx, site, providerOut ?? 'auto', by)
      if (!hoisted) {
        continue
      }
    }
    const id =
      config.idMode === 'dev'
        ? devFunctionId(key)
        : config.idMode === 'placeholder'
          ? placeholderId(key)
          : defaultFunctionId(key)
    const name = site.exportName ?? site.base
    const h = site.handler
    // the provider wrapper's name: a binding and an export of the same name (an export list
    // `export { name }` survives tools that re-export bindings by their local name), allocated
    // identically in every env (the resolver is generated from the client's registry)
    const wrapperBase = `${identifierBase(site.stableKey)}_createServerFn_handler`
    let wrapperName = wrapperBase
    for (
      let n = 1;
      !(names.isFree(wrapperName) && names.isExportNameFree(wrapperName));
      n++
    ) {
      wrapperName = `${wrapperBase}$${n}`
    }
    const rpcLocal = names.alloc(wrapperName)
    const exportName = names.allocExportName(wrapperName)
    const providerDerived = derivesProvider
    if (role === 'client') {
      const rpc = glueImport(specs.clientRpc, 'createClientRpc', 'tsrClientRpc')
      // in dev the stub also names its file's revision (an argument the runtime ignores): the
      // handler may have changed with any edit of the file, and a webpack-family host
      // hot-updates a module only when its output changed, so the client module of an edited
      // server fn changes and its route refreshes (Vite updates every module of the file)
      const args =
        config.idMode === 'dev'
          ? `(${stringLiteral(id)}, ${stringLiteral((devRevision ??= revision(ctx.analysis.source.code)))})`
          : `(${stringLiteral(id)})`
      rewrites.add({
        range: rangeOf(h),
        body: [text({ sym: rpc, ctx: 'callee' }, args)],
        scope: 'all-outputs',
        by,
      })
      facts.serverFns.push(
        serverFnFact(site, id, name, exportName, providerDerived, rootRel),
      )
      continue
    }
    if (role === 'ssr-caller' || providerOut) {
      const rpc = glueImport(specs.ssrRpc, 'createSsrRpc', 'tsrSsrRpc')
      rewrites.add({
        range: rangeOf(h),
        body: [text({ sym: rpc, ctx: 'callee' }, `(${stringLiteral(id)})`)],
        scope: role === 'ssr-caller' ? 'all-outputs' : envScope,
        by,
      })
      if (providerOut && site.nested) {
        // the hoist claims the chain for the provider output; the env module
        // keeps the chain in place with its stub (an edit on exactly the
        // claimed region overrides the placeholder there) instead of
        // importing the hoisted binding from the provider module, which
        // would evaluate the provider (and what its handlers import) in
        // this env. The override is addressed to the env module: a chain
        // inside a function that moves into a split chunk renders the
        // placeholder there and the chunk imports the provider module. No
        // environment loads such a chunk: a derived provider exists only in
        // the Vite `rsc` environment, whose entry reaches route modules
        // through their provider outputs alone (react-start-rsc
        // `rsc-start-build.test.ts`, "a server fn nested in a function only
        // the split component calls").
        const chain = rangeOf(site.chain.terminal)
        rewrites.add({
          range: chain,
          body: [
            slice({ start: chain.start, end: h.start }),
            text({ sym: rpc, ctx: 'callee' }, `(${stringLiteral(id)})`),
            slice({ start: h.end, end: chain.end }),
          ],
          scope: ['env'],
          by,
        })
      }
      if (role === 'ssr-caller') {
        facts.serverFns.push(
          serverFnFact(site, id, name, exportName, providerDerived, rootRel),
        )
        continue
      }
    }
    // provider: the chain stays in place next to a generated createServerRpc export; an
    // in-place provider's handler moves to the handler module, loaded on the first call
    const serverRpc = glueImport(
      specs.serverRpc,
      'createServerRpc',
      'tsrServerRpc',
    )
    const opts = names.alloc('opts')
    let fnSym: SymbolId
    let anchor:
      | { k: 'after-header' }
      | { k: 'before-unit' | 'after-unit'; unit: number }
    const home: 'auto' | OutputId = providerOut ?? 'auto'
    let commitHoist: (() => void) | null = null
    if (!site.nested) {
      fnSym = site.topLevelSym!
      anchor = { k: 'before-unit', unit: site.topLevelUnit!.id }
    } else {
      fnSym = hoisted!.sym
      anchor = hoisted!.anchor
      commitHoist = hoisted!.commit
    }
    if (lazySites.has(site)) {
      const { out, load } = lazyHandlerOutput()
      const local = names.alloc(`tsrHandler$${identifierBase(site.stableKey)}`)
      const owner = rewrites.addGenerated({
        body: [
          text('const ', { sym: local.sym }, ' = '),
          slice(rangeOf(h)),
          text('\nexport { ', { sym: local.sym }, ' }\n'),
        ],
        declares: [local.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: out,
        by,
      })
      ctx.addRoot(out, { t: 'gen', id: owner })
      rewrites.claim({
        region: ctx.region(rangeOf(h), 'custom'),
        owner,
        placeholder: [
          text(
            { sym: rpcLocal.sym },
            ', (...args) => ',
            { sym: load, ctx: 'callee' },
            `().then((m) => m.${local.name}(...args))`,
          ),
        ],
        by,
      })
    } else {
      rewrites.add({
        range: { start: h.start, end: h.start },
        body: [text({ sym: rpcLocal.sym }, ', ')],
        scope: providerScope,
        by,
      })
    }
    const gen = rewrites.addGenerated({
      body: [
        text(
          'const ',
          { sym: rpcLocal.sym },
          ' = ',
          { sym: serverRpc, ctx: 'callee' },
          `({ id: ${stringLiteral(id)}, name: ${stringLiteral(name)}, filename: ${stringLiteral(rootRel)} }, (`,
          { sym: opts.sym },
          ') => ',
          { sym: fnSym },
          '.__executeServer(',
          { sym: opts.sym },
          '))\nexport { ',
          { sym: rpcLocal.sym },
          ' }\n',
        ),
      ],
      declares: [rpcLocal.sym],
      effectful: false,
      anchor,
      home,
      by,
    })
    if (!providerOut) {
      ctx.addRoot('env', { t: 'gen', id: gen })
    }
    // the hoisted chain renders after its wrapper (the chain reads the wrapper eagerly)
    commitHoist?.()
    facts.serverFns.push(
      serverFnFact(site, id, name, exportName, providerDerived, rootRel),
    )
  }

  // the in-place provider accepts its own hot updates in development (J4.15): an edit of a
  // module only its handlers read reaches the next call without an SSR full reload
  if (
    role === 'provider' &&
    !providerOut &&
    ctx.env.mode === 'dev' &&
    facts.serverFns.length > 0
  ) {
    ctx.addRoot('env', { t: 'gen', id: acceptHotUpdates('auto', '\n') })
  }

  // ---- 6. unsupported uses (leak-prone on the client)
  if (role === 'client') {
    for (const u of analysis.unsupported) {
      diag(
        'Unsupported use of a TanStack Start builder: a computed member access cannot be compiled. Call its methods directly (`.handler(...)`, `.server(...)`).',
        rangeOf(u.node),
      )
    }
  }

  // ---- 7. function-local declarators only removed code read (none without an edit of ours)
  if (rewrites.edits.length + rewrites.claims.size > editsBefore) {
    cleanOrphanedDeclarations(ctx, envScope, by)
  }

  ctx.setFacts(START_ENV, facts)
}

/**
 * Whether the module awaits at its top level (`await`, `for await`) outside
 * any function. Only top-level statements whose text has `await` are walked.
 */
function hasTopLevelAwait(ctx: PlanContext): boolean {
  const code = ctx.analysis.source.code
  const hit = { found: false }
  const skipFn = (_n: Node, w: { skip: () => void }) => w.skip()
  let at = -1
  for (const statement of ctx.analysis.file.program.body) {
    if (at < statement.start) {
      at = code.indexOf('await', statement.start)
    }
    if (at === -1) {
      return false
    }
    if (at >= statement.end) {
      continue
    }
    walk(statement, {
      FunctionDeclaration: skipFn,
      FunctionExpression: skipFn,
      ArrowFunctionExpression: skipFn,
      AwaitExpression: (_n, w) => {
        hit.found = true
        w.stop()
      },
      ForOfStatement: (n, w) => {
        if (n.await) {
          hit.found = true
          w.stop()
        }
      },
    })
    if (hit.found) {
      return true
    }
  }
  return false
}

function serverFnFact(
  site: ServerFnSite,
  id: string,
  name: string,
  exportName: string,
  providerDerived: boolean,
  rootRel: string,
): ServerFnFact {
  return {
    rootRel,
    stableKey: site.stableKey,
    id,
    exportName,
    name,
    providerDerived,
  }
}

function relativeRoot(root: string, path: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/')
  const r = norm(root).replace(/\/+$/, '')
  const p = norm(path)
  if (p.startsWith(`${r}/`)) {
    return p.slice(r.length + 1)
  }
  // outside the root: a relative path with `..` segments
  const a = r.split('/')
  const b = p.split('/')
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++
  }
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}

/**
 * Hoists a nested server-fn chain to module level on the server (J4.6): the
 * chain region is claimed by a generated `const`, the occurrence becomes a
 * reference to it. Refuses, positioned, when the chain captures a local,
 * `this`/`arguments`/`super`/`new.target`/`await`/`yield` of an enclosing
 * function, evaluates an impure eager expression or reads a mutated module
 * binding.
 */
function hoist(
  ctx: PlanContext,
  site: ServerFnSite,
  home: 'auto' | OutputId,
  by: string,
): {
  sym: SymbolId
  anchor: { k: 'after-header' } | { k: 'after-unit'; unit: number }
  /** Adds the hoist unit and its claim (called after the wrapper unit exists, so it renders first). */
  commit: () => void
} | null {
  const { t1, symbols, names, rewrites } = ctx
  const file = ctx.analysis.file
  const X = site.chain.terminal
  const xRange = rangeOf(X)
  const h = site.handler
  const hRange = rangeOf(h)
  // the claim is dead where the enclosing code is erased: no diagnostics there
  if (ctx.liveness(home === 'auto' ? 'env' : home).isErased(xRange)) {
    return null
  }
  const refuse = (message: string, range: Range) => {
    ctx.diagnostic({ severity: 'error', message, range, by })
    return null
  }
  // captures of enclosing functions
  const captures = t1.capturesOf(xRange)
  if (captures.length > 0) {
    const first = t1.refs.refsIn(xRange).find((r) => captures.includes(r.sym))
    const name = symbols.name(captures[0]!)
    return refuse(
      `A server function nested in a function cannot be compiled when its code reads the local \`${name}\` of the enclosing function. Move the server function to the module top level or pass \`${name}\` through its data.`,
      first ? first.range : xRange,
    )
  }
  // this / arguments / super / new.target / await / yield owned by an enclosing function
  const found: { node: Node | null } = { node: null }
  walk(X, {
    enter: (n, wctx) => {
      if (found.node) {
        wctx.stop()
        return
      }
      const inFn = wctx
        .ancestors()
        .some(
          (a) =>
            a !== X &&
            a.start >= X.start &&
            (a.type === 'FunctionExpression' ||
              a.type === 'FunctionDeclaration' ||
              a.type === 'ClassBody'),
        )
      const inAnyFn = wctx
        .ancestors()
        .some(
          (a) =>
            a !== X &&
            a.start >= X.start &&
            (a.type === 'FunctionExpression' ||
              a.type === 'FunctionDeclaration' ||
              a.type === 'ArrowFunctionExpression'),
        )
      switch (n.type) {
        case 'ThisExpression':
        case 'Super':
          if (!inFn) {
            found.node = n
          }
          break
        case 'MetaProperty':
          if (!inFn && n.meta.name === 'new') {
            found.node = n
          }
          break
        case 'Identifier':
          if (
            n.name === 'arguments' &&
            !inFn &&
            !file.referenceOf(n)?.binding
          ) {
            found.node = n
          }
          break
        case 'AwaitExpression':
        case 'YieldExpression':
          if (!inAnyFn) {
            found.node = n
          }
          break
        default:
          break
      }
    },
  })
  if (found.node) {
    const o = found.node
    return refuse(
      'A server function nested in a function cannot be compiled when its code uses `this`, `arguments`, `super`, `new.target`, `await` or `yield` of the enclosing function. Move it to the module top level.',
      rangeOf(o),
    )
  }
  // eager sub-expressions outside the handler must be pure
  const eagerArgs: Array<Node> = []
  if (
    site.chain.headIsFactoryCall &&
    site.chain.head.type === 'CallExpression'
  ) {
    eagerArgs.push(...site.chain.head.arguments)
  }
  for (const l of site.chain.links) {
    if (l.method === 'handler') {
      continue
    }
    eagerArgs.push(...l.call.arguments)
  }
  for (const a of eagerArgs) {
    if (!isPureExpression(ctx.analysis.purity, a)) {
      return refuse(
        'A server function nested in a function cannot be hoisted: its options evaluate an expression with side effects at module level. Move the server function, or that expression, to the module top level.',
        rangeOf(a),
      )
    }
  }
  // module-level reads outside the handler: no mutated let/var; anchor after their declarations
  let maxItem = -1
  let maxUnit: number | null = null
  for (const r of t1.refs.refsIn(xRange)) {
    if (r.range.start >= hRange.start && r.range.end <= hRange.end) {
      continue
    }
    if (!symbols.isModuleLevel(r.sym)) {
      continue
    }
    if (t1.mutation.isMutated(r.sym)) {
      // hoisted, the read runs when the module loads instead of when the
      // enclosing function runs: a binding something writes may differ
      return refuse(
        `A server function nested in a function cannot be hoisted: it reads \`${symbols.name(r.sym)}\`, a module binding that is reassigned or mutated. Move the server function to the module top level.`,
        r.range,
      )
    }
    for (const u of t1.declaringUnits.get(r.sym) ?? []) {
      const unit = t1.units[u]!
      if (unit.kind === 'import-specifier') {
        continue
      }
      if (unit.item > maxItem) {
        maxItem = unit.item
        maxUnit = u
      }
    }
  }
  if (!t1.isLazyAt(X.start) && maxItem >= 0) {
    const own = t1.items.find(
      (it) => it.range.start <= X.start && X.start < it.range.end,
    )
    if (own && own.index <= maxItem) {
      return refuse(
        'A server function in a top-level block cannot be hoisted above the declarations it reads. Move it to the module top level.',
        xRange,
      )
    }
  }
  const anchor =
    maxUnit === null
      ? ({ k: 'after-header' } as const)
      : ({ k: 'after-unit', unit: maxUnit } as const)
  const hoisted = names.alloc(`tsrServerFn$${identifierBase(site.base)}`)
  const commit = () => {
    const region = ctx.region(xRange, 'nested-chain')
    const owner: GenUnitId = rewrites.addGenerated({
      body: [
        text('const ', { sym: hoisted.sym }, ' = '),
        slice(xRange),
        text('\n'),
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor,
      home,
      by,
    })
    rewrites.claim({
      region,
      owner,
      placeholder: [text({ sym: hoisted.sym })],
      by,
    })
  }
  return { sym: hoisted.sym, anchor, commit }
}
