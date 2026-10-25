/**
 * The `start-env` planner (DESIGN §3.10; D6, R12, R44): Start's environment
 * separation on the core's plan. Server fns become client/SSR stubs or keep
 * their handler in place next to a generated `createServerRpc` export;
 * middleware links, isomorphic implementations and env-only fns are
 * selected per env; `<ClientOnly>` children leave server envs; nested
 * server fns are hoisted on the server when that is safe, else refused at
 * the capture. Everything the removed code alone referenced is dropped by
 * the core's provenance-based placement; function-local declarators only
 * removed code read are cleaned here.
 */
import {
  extendOverTrailingLine,
  identifierBase,
  isPureExpression,
  stringLiteral,
  walk,
} from '@tanstack/router-utils/compiler'
import { runtimeSpecifiers, startRecognizer } from '../compiler/recognizer'
import { prefetchStartValues } from '../compiler/prefetch'
import { startAnalysisOf, unwrapNode } from '../compiler/start-analysis'
import {
  defaultFunctionId,
  devFunctionId,
  placeholderId,
} from '../server-fns/ids'
import type { Chain, StartAnalysis } from '../compiler/start-analysis'
import type { ServerFnFact } from '../server-fns/registry'
import type {
  Diagnostic,
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
  /** Whether the server-fn provider is a different env than the SSR caller (Vite RSC). */
  providerSeparate: boolean
  /** `dev`: opaque dev ids; `default`: hashed ids; `placeholder`: a custom generator decides at renderChunk. */
  idMode: 'dev' | 'default' | 'placeholder'
  /** The directive a derived provider module carries (RSC), if any. */
  providerDirective?: string
  /**
   * Every module defining server fns gets a derived provider module, not
   * only `'use client'` ones (Rsbuild RSC: the provider is the `rsc` layer,
   * selected by the `?tss-serverfn-split` query; DESIGN §3.10.5).
   */
  alwaysDeriveProvider?: boolean
  /** Whether resolved ids are opaque packages (never read for summaries). */
  isOpaque?: (resolvedCanonicalId: string) => boolean
}

export interface StartEnvFacts {
  serverFns: Array<ServerFnFact>
  useClient: boolean
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
  /** The terminal `.handler(h)` call node. */
  call: Extract<Node, { type: 'CallExpression' }>
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
      case 'JSXAttribute':
        base = p.name.type === 'JSXIdentifier' ? p.name.name : ''
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
  const role = roleOf(ctx, config)
  const isServer = role !== 'client'
  const by = START_ENV
  const specs = runtimeSpecifiers(config.framework)
  const useClient = ma.header.directives.some((d) => d.value === 'use client')
  const rootRel = relativeRoot(config.root, ctx.identity.path)
  const facts: StartEnvFacts = { serverFns: [], useClient }

  const diag = (
    message: string,
    range: Range,
    severity: Diagnostic['severity'] = 'error',
    code?: string,
  ) => ctx.diagnostic({ severity, message, range, by, code })

  // ---- derived provider output (RSC: a 'use client' module compiled by the separate provider env)
  let providerOut: OutputId | null = null
  const serverFnChains = analysis.chains.filter(
    (c) => c.terminalValue.t === 'serverFn' && !c.unsupported,
  )
  const derivesProvider =
    config.providerSeparate &&
    (useClient || config.alwaysDeriveProvider === true)
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
      rewrites.addGenerated({
        body: [
          text(
            'if (import.meta.hot) {\n  import.meta.hot.accept(() => {})\n}\n',
          ),
        ],
        declares: [],
        effectful: true,
        anchor: { k: 'end' },
        home: providerOut,
        by,
      })
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
          reason: `strip .${link.method}()`,
        })
      }
    }
  }

  // ---- 2. server fns
  const sites: Array<ServerFnSite> = []
  const keyCount = new Map<string, number>()
  for (const chain of serverFnChains) {
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
      call: handlerLink.call,
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
        unwrapNode(link.arg),
        chain.wrapped,
        chain.parent,
      )
      rewrites.add({
        range: rangeOf(X),
        body: parens
          ? [text('('), slice(rangeOf(link.arg)), text(')')]
          : [slice(rangeOf(link.arg))],
        scope: 'all-outputs',
        by,
        reason: `isomorphic ${wantLink} implementation`,
      })
      continue
    }
    if (chain.headIsFactoryCall) {
      const parens = needsParens('arrow', chain.wrapped, chain.parent)
      rewrites.add({
        range: rangeOf(X),
        body: [text(parens ? '(() => {})' : '() => {}')],
        scope: 'all-outputs',
        by,
        reason: 'isomorphic fn without an implementation for this environment',
      })
      continue
    }
    if (chain.links.length > 0) {
      // the implementation lives on the stored receiver (this module or another): strip this segment's links
      rewrites.add({
        range: rangeOf(X),
        body: [slice(rangeOf(chain.head))],
        scope: 'all-outputs',
        by,
        reason: 'isomorphic links of the other environment',
      })
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
      const parens = needsParens(unwrapNode(c.arg), wrapped, parent)
      rewrites.add({
        range: rangeOf(c.call),
        body: parens
          ? [text('('), slice(rangeOf(c.arg)), text(')')]
          : [slice(rangeOf(c.arg))],
        scope: 'all-outputs',
        by,
        reason: `${c.kind}-only implementation`,
      })
    } else {
      const message = `create${c.kind === 'server' ? 'Server' : 'Client'}OnlyFn() functions can only be called on the ${c.kind}!`
      const parens = needsParens('arrow', wrapped, parent)
      const stub = `() => { throw new Error(${stringLiteral(message, '"')}) }`
      rewrites.add({
        range: rangeOf(c.call),
        body: [text(parens ? `(${stub})` : stub)],
        scope: 'all-outputs',
        by,
        reason: `${c.kind}-only stub`,
      })
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
        reason: 'ClientOnly children',
      })
    }
  }

  // ---- 2b. server fn rewrites
  for (const site of sites) {
    const key = { rootRel, stableKey: site.stableKey }
    // a nested server fn is checked for hoistability in every env (J4.6: every env refuses
    // at the capture, or every env supports it); the hoist itself happens on the provider
    let hoisted: ReturnType<typeof hoist> = null
    if (site.nested) {
      hoisted = hoist(ctx, analysis, site, providerOut ?? 'auto', by)
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
      rewrites.add({
        range: rangeOf(h),
        body: [text({ sym: rpc, ctx: 'callee' }, `(${stringLiteral(id)})`)],
        scope: 'all-outputs',
        by,
        reason: 'client rpc stub',
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
        reason: 'ssr rpc stub',
      })
      if (role === 'ssr-caller') {
        facts.serverFns.push(
          serverFnFact(site, id, name, exportName, providerDerived, rootRel),
        )
        continue
      }
    }
    // provider: the handler stays in place next to a generated createServerRpc export
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
    rewrites.add({
      range: { start: h.start, end: h.start },
      body: [text({ sym: rpcLocal.sym }, ', ')],
      scope: providerScope,
      by,
      reason: 'server rpc wrapper argument',
    })
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
    const accept = rewrites.addGenerated({
      body: [
        text(
          '\nif (import.meta.hot) {\n  import.meta.hot.accept(() => {})\n}\n',
        ),
      ],
      declares: [],
      effectful: true,
      anchor: { k: 'end' },
      home: 'auto',
      by,
    })
    ctx.addRoot('env', { t: 'gen', id: accept })
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

  // ---- 7. function-local declarators only removed code read
  cleanOrphanedLocals(ctx, envScope, by)

  // ---- 8. `assert` import attributes keep working (G12): the keyword browsers dropped becomes `with`
  for (const imp of ma.imports) {
    if (!imp.attributesRange) {
      continue
    }
    const between = ma.source.code.slice(
      imp.specifierRange.end,
      imp.attributesRange.start,
    )
    const m = /\bassert\b/.exec(between)
    if (m) {
      const start = imp.specifierRange.end + m.index
      rewrites.add({
        range: { start, end: start + 'assert'.length },
        body: [text('with')],
        scope: 'all-outputs',
        by,
        reason: 'import attributes keyword',
      })
    }
  }

  ctx.setFacts(START_ENV, facts)
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
 * Hoists a nested server-fn chain to module level on the server (R12): the
 * chain region is claimed by a generated `const`, the occurrence becomes a
 * reference to it. Refuses, positioned, when the chain captures a local,
 * `this`/`arguments`/`super`/`new.target`/`await`/`yield` of an enclosing
 * function, evaluates an impure eager expression or reads a mutated module
 * binding.
 */
function hoist(
  ctx: PlanContext,
  analysis: StartAnalysis,
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
    if (symbols.isReassignable(r.sym) && t1.refs.writesOf(r.sym).length > 0) {
      return refuse(
        `A server function nested in a function cannot be hoisted: it reads \`${symbols.name(r.sym)}\`, a module binding that is reassigned. Move the server function to the module top level.`,
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

/**
 * Function-local declarators (and `var`/block declarators of the module
 * level the core's units do not model) all of whose references this
 * planner erased: pure initialisers go with the declarator; an impure
 * initialiser at function level stays as an expression statement (its
 * hook calls keep running); module level drops it with the declaration
 * (J4.12, documented removal). Iterates to a fixpoint.
 */
function cleanOrphanedLocals(
  ctx: PlanContext,
  scope: EditScope,
  by: string,
): void {
  const { t1, symbols, rewrites } = ctx
  const file = ctx.analysis.file
  const code = ctx.analysis.source.code
  const handled = new Set<number>()
  for (let round = 0; round < 8; round++) {
    const live = ctx.liveness('env')
    let changed = false
    // object pattern properties pruned this round, removed together per pattern
    const prunedProps = new Map<Node, Set<Node>>()
    // declarators of multi-declarator statements pruned this round, removed
    // together per statement (R17: one edit per statement from the final set)
    const prunedDecls = new Map<Node, Set<Node>>()
    for (const b of file.bindings) {
      if (handled.has(b.id) || b.import) {
        continue
      }
      const sym = symbols.ofBinding(b)
      if (symbols.kind(sym) !== 'source') {
        continue
      }
      const decl = b.declarations[0]
      const declParent = decl ? file.parentOf(decl) : null
      // a `var` hoisted out of a nested block is declared by the effect unit
      // (statement) holding it: its declarator is cleaned here, like before
      const declaring = t1.declaringUnits.get(sym)
      if (
        symbols.isModuleLevel(sym) &&
        declaring !== undefined &&
        declaring.some((u) => t1.units[u]!.kind !== 'effect') &&
        declParent?.type !== 'AssignmentPattern' &&
        declParent?.type !== 'Property' &&
        declParent?.type !== 'ArrayPattern'
      ) {
        continue // the core's placement decides top-level units (destructuring leaves are pruned here)
      }
      if (!decl || b.declarations.length !== 1) {
        continue
      }
      const parent = file.parentOf(decl)
      if (!parent) {
        continue
      }
      const refs = t1.refs.refsOf(sym)
      if (refs.length === 0 || !refs.every((r) => !live.live(r))) {
        continue
      }
      if (live.isErased(rangeOf(decl))) {
        handled.add(b.id)
        continue
      }
      if (
        parent.type === 'AssignmentPattern' ||
        parent.type === 'Property' ||
        parent.type === 'ArrayPattern'
      ) {
        if (prunePatternElement(ctx, decl, scope, by, prunedProps)) {
          handled.add(b.id)
          changed = true
        }
        continue
      }
      if (parent.type === 'VariableDeclarator' && parent.id === decl) {
        const statement = file.parentOf(parent)
        if (!statement || statement.type !== 'VariableDeclaration') {
          continue
        }
        const moduleLevel = !t1.isLazyAt(decl.start)
        const pure =
          parent.init === null ||
          isPureExpression(ctx.analysis.purity, parent.init)
        handled.add(b.id)
        changed = true
        if (statement.declarations.length === 1) {
          const stmtParent = file.parentOf(statement)
          const asStatement =
            stmtParent !== null &&
            (stmtParent.type === 'BlockStatement' ||
              stmtParent.type === 'Program' ||
              stmtParent.type === 'SwitchCase' ||
              stmtParent.type === 'StaticBlock')
          if (!asStatement) {
            handled.delete(b.id)
            changed = false
            continue
          }
          if (
            pure ||
            moduleLevel ||
            initReadsOnlyOrphanedImports(ctx, parent.init!, live)
          ) {
            rewrites.add({
              range: {
                start: statement.start,
                end: extendOverTrailingLine(code, statement.end),
              },
              body: [],
              scope,
              by,
              reason: 'orphaned local declaration',
            })
          } else {
            rewrites.add({
              range: { start: statement.start, end: statement.end },
              body: [slice(rangeOf(parent.init!)), text(';')],
              scope,
              by,
              reason: 'orphaned local declarator: effects kept',
            })
          }
          continue
        }
        if (
          !pure &&
          !moduleLevel &&
          !initReadsOnlyOrphanedImports(ctx, parent.init!, live)
        ) {
          handled.delete(b.id)
          changed = false
          continue
        }
        let set = prunedDecls.get(statement)
        if (!set) {
          set = new Set()
          prunedDecls.set(statement, set)
        }
        set.add(parent)
        continue
      }
      if (
        (parent.type === 'FunctionDeclaration' ||
          parent.type === 'ClassDeclaration') &&
        parent.id === decl &&
        t1.isLazyAt(parent.start)
      ) {
        const stmtParent = file.parentOf(parent)
        if (!stmtParent || stmtParent.type !== 'BlockStatement') {
          continue
        }
        if (
          parent.type === 'ClassDeclaration' &&
          !isPureExpression(ctx.analysis.purity, parent)
        ) {
          continue
        }
        handled.add(b.id)
        changed = true
        rewrites.add({
          range: {
            start: parent.start,
            end: extendOverTrailingLine(code, parent.end),
          },
          body: [],
          scope,
          by,
          reason: 'orphaned local declaration',
        })
      }
    }
    for (const [pattern, props] of prunedProps) {
      removePatternProperties(ctx, pattern, props, live, scope, by)
    }
    for (const [statement, decls] of prunedDecls) {
      removeDeclarators(ctx, statement, decls, live, scope, by)
    }
    if (!changed) {
      break
    }
  }
}

/**
 * Removes the declarators `pruned` of a multi-declarator statement (R17: the
 * removals of one statement are computed from its final kept set): when
 * every declarator is gone (pruned now, or erased by an earlier round) the
 * statement goes with its line; otherwise each run of gone declarators is
 * one range with the separator to its next kept declarator (or from its
 * previous one), so removals of neighbours never partially overlap, and a
 * later round's run encloses the earlier one it grew from.
 */
function removeDeclarators(
  ctx: PlanContext,
  statement: Node,
  pruned: ReadonlySet<Node>,
  live: ReturnType<PlanContext['liveness']>,
  scope: EditScope,
  by: string,
): void {
  if (statement.type !== 'VariableDeclaration') {
    return
  }
  const code = ctx.analysis.source.code
  const decls = statement.declarations as ReadonlyArray<Node>
  const gone = (d: Node) => pruned.has(d) || live.isErased(rangeOf(d))
  if (decls.every(gone)) {
    const stmtParent = ctx.analysis.file.parentOf(statement)
    const asStatement =
      stmtParent !== null &&
      (stmtParent.type === 'BlockStatement' ||
        stmtParent.type === 'Program' ||
        stmtParent.type === 'SwitchCase' ||
        stmtParent.type === 'StaticBlock')
    if (asStatement) {
      ctx.rewrites.add({
        range: {
          start: statement.start,
          end: extendOverTrailingLine(code, statement.end),
        },
        body: [],
        scope,
        by,
        reason: 'orphaned local declaration',
      })
      return
    }
  }
  // a declaration that is no statement (`for (const a = 1, b = 2;;)`) keeps
  // its last declarator so the syntax stays
  const last = decls[decls.length - 1]!
  const keepLast = decls.every(gone)
  const isGone = (d: Node) => gone(d) && !(keepLast && d === last)
  for (let i = 0; i < decls.length; i++) {
    if (!isGone(decls[i]!)) {
      continue
    }
    let j = i
    while (j + 1 < decls.length && isGone(decls[j + 1]!)) {
      j++
    }
    if (decls.slice(i, j + 1).some((d) => pruned.has(d))) {
      const next = decls[j + 1]
      const prev = decls[i - 1]
      ctx.rewrites.add({
        range: next
          ? { start: decls[i]!.start, end: next.start }
          : { start: prev!.end, end: decls[j]!.end },
        body: [],
        scope,
        by,
        reason: 'orphaned local declarator',
      })
    }
    i = j
  }
}

/**
 * Removes the properties `pruned` of an object pattern: each run of
 * properties gone (pruned now, or erased by an earlier round) is one range
 * with the separator to its next kept property (or from its previous one),
 * so removals of neighbours never partially overlap.
 */
function removePatternProperties(
  ctx: PlanContext,
  pattern: Node,
  pruned: ReadonlySet<Node>,
  live: ReturnType<PlanContext['liveness']>,
  scope: EditScope,
  by: string,
): void {
  if (pattern.type !== 'ObjectPattern') {
    return
  }
  const props = pattern.properties as ReadonlyArray<Node>
  const gone = (p: Node) => pruned.has(p) || live.isErased(rangeOf(p))
  for (let i = 0; i < props.length; i++) {
    if (!gone(props[i]!)) {
      continue
    }
    let j = i
    while (j + 1 < props.length && gone(props[j + 1]!)) {
      j++
    }
    if (props.slice(i, j + 1).some((p) => pruned.has(p))) {
      const next = props[j + 1]
      const prev = props[i - 1]
      ctx.rewrites.add({
        range: next
          ? { start: props[i]!.start, end: next.start }
          : prev
            ? { start: prev.end, end: props[j]!.end }
            : { start: props[i]!.start, end: props[j]!.end },
        body: [],
        scope,
        by,
        reason: 'orphaned pattern property',
      })
    }
    i = j
  }
}

/**
 * Whether an impure initialiser is server-only code the removal documents
 * (J4.12): it reads at least one import, and every import it reads has no
 * other live reference (the import leaves with it). Otherwise its effects
 * are kept as a statement (a hook call next to a removed implementation).
 */
function initReadsOnlyOrphanedImports(
  ctx: PlanContext,
  init: Node,
  live: ReturnType<PlanContext['liveness']>,
): boolean {
  const { t1, symbols } = ctx
  const range = rangeOf(init)
  let imports = 0
  for (const r of t1.refs.refsIn(range)) {
    if (!symbols.isImport(r.sym)) {
      continue
    }
    imports++
    const others = t1.refs
      .valueRefsOf(r.sym)
      .filter(
        (o) => !(o.range.start >= range.start && o.range.end <= range.end),
      )
    if (others.some((o) => live.live(o))) {
      return false
    }
  }
  return imports > 0
}

/**
 * Removes a destructuring element whose binding only removed code read (its
 * default value or computed key may read server-only imports): an object
 * pattern property goes with its comma (never when the pattern has a rest
 * element, which would then receive the key); an array pattern element
 * becomes a hole.
 */
function prunePatternElement(
  ctx: PlanContext,
  decl: Node,
  scope: EditScope,
  by: string,
  prunedProps: Map<Node, Set<Node>>,
): boolean {
  const file = ctx.analysis.file
  let node: Node = decl
  let parent = file.parentOf(node)
  if (parent?.type === 'AssignmentPattern' && parent.left === node) {
    node = parent
    parent = file.parentOf(node)
  }
  if (!parent) {
    return false
  }
  if (parent.type === 'Property') {
    const pattern = file.parentOf(parent)
    if (!pattern || pattern.type !== 'ObjectPattern') {
      return false
    }
    if (pattern.properties.some((p) => p.type === 'RestElement')) {
      return false
    }
    let set = prunedProps.get(pattern)
    if (!set) {
      set = new Set()
      prunedProps.set(pattern, set)
    }
    set.add(parent)
    return true
  }
  if (parent.type === 'ArrayPattern') {
    ctx.rewrites.add({
      range: { start: node.start, end: node.end },
      body: [],
      scope,
      by,
      reason: 'orphaned pattern element',
    })
    return true
  }
  return false
}
