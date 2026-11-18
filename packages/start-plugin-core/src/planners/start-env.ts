/**
 * The `start-env` planner (J4): Start's environment
 * separation on the core's plan. Server fns become client/SSR stubs, or
 * keep their chain next to a generated `createServerRpc` export in the
 * provider; an in-place provider (SSR) moves the handlers into one derived
 * handler module it imports on the first call (what only handlers read
 * loads then, once, but a declaration whose evaluation reads something the
 * module keeps; everything the module keeps is imported back: one instance,
 * R157);
 * middleware links, isomorphic implementations and env-only fns are
 * selected per env; `<ClientOnly>` children leave server envs (RSC: but a
 * handler's); nested
 * server fns are hoisted on the server when that is safe, else refused at
 * the capture. Everything the removed code alone referenced is dropped by
 * the core: its removal rule at the module level (`placement.ts`:
 * statements stay with what they name, R154), its orphan cleanup for
 * function-local declarators and destructured bindings.
 */
import {
  cacheDisabled,
  derivedIdOf,
  identifierBase,
  isExpressionWrapper,
  opensNonExpressionStatement,
  patternIdentifiers,
  revision,
  sameFileSpecifier,
  stringLiteral,
  unwrapExpression,
  walk,
} from '@tanstack/router-utils/compiler'
import { relative } from 'pathe'
import {
  START_KINDS,
  runtimeSpecifiers,
  startRecognizer,
} from '../compiler/recognizer'
import { prefetchStartValues } from '../compiler/prefetch'
import { isFunctionNode, startAnalysisOf } from '../compiler/start-analysis'
import { devFunctionId, placeholderId } from '../server-fns/ids'
import {
  defaultFunctionId,
  fileTag as fileTagOf,
  handlerFunctionName,
  metaName,
  moduleLiteral,
  providerExportBase,
} from '../server-fns/format'
import { startServerCode } from './server-code'
import type {
  LateExport,
  NamespaceEscape,
  StartPrefetch,
} from '../compiler/prefetch'
import type { Chain, Escape, EscapeReason } from '../compiler/start-analysis'
import type { ProviderModule, ServerFnFact } from '../server-fns/registry'
import type {
  AbstractValue,
  EditScope,
  Frag,
  GenUnitId,
  YukuNode as Node,
  OutputId,
  PlanContext,
  Planner,
  Range,
  SymbolId,
  TextFrag,
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
  /**
   * The module is JavaScript another plugin compiled from a file that is no
   * JavaScript (`.mdx`, `.vue`, …; the late pass): every rewrite stays in the
   * module (a derived module would read the file).
   */
  late?: boolean
}

export interface StartEnvFacts {
  serverFns: Array<ServerFnFact>
  /**
   * The late pass (`config.late`): the binding each refused escape of a
   * binding hands on, by the escape's offset (another plugin's generated
   * code may hand it on: `compiler/vue.ts`). Absent when there is none.
   */
  lateEscapes?: Array<LateEscape>
  /**
   * A Vue SFC's module (its path ends with `.vue`): each server fn refused as
   * not hoistable, by its diagnostic's offset, and the local it reads, if
   * that is why (`compiler/vue.ts` words it for `<script setup>`).
   */
  vueHoists?: Array<VueHoist>
}

/** A server fn of a Vue SFC's module that cannot be hoisted. */
export interface VueHoist {
  /** Its diagnostic's range start. */
  at: number
  /** The local of the enclosing function it reads, and whether that local holds the server fn's builder (else: its position, R162). */
  reads?: { name: string; builder: boolean }
}

/** An escape of the late pass that hands on a binding of the module. */
export interface LateEscape {
  /** Where the escape is reported (its diagnostic's range start). */
  at: number
  name: string
  /** The binding's declaration. */
  declaration: Range
}

type Role = 'client' | 'ssr-caller' | 'provider'

const text = (
  ...parts: Array<
    string | { sym: SymbolId; ctx?: 'expr' | 'callee' | 'jsxTag' }
  >
): TextFrag => ({
  k: 'text',
  parts,
})
const slice = (range: Range): Frag => ({ k: 'slice', range })
const rangeOf = (n: Node): Range => ({ start: n.start, end: n.end })

/**
 * Whether the text of `kept` (or a generated arrow) needs parentheses when it
 * replaces the expression `original` under `parent`. Decided on the node whose
 * text is kept, wrappers included: `impl as any` is no callee.
 */
function needsParens(
  code: string,
  kept: Node | 'arrow',
  original: Node,
  parent: Node | null,
): boolean {
  if (!parent) {
    return false
  }
  if (parent.type === 'ExpressionStatement') {
    return kept !== 'arrow' && opensNonExpressionStatement(code, kept.start)
  }
  const kind = kept === 'arrow' ? 'ArrowFunctionExpression' : kept.type
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

/**
 * The text of `kept` in place of the expression `original`: `(0, kept)`
 * where the value of `original` is called or tagged at once (through the
 * wrappers of `isExpressionWrapper`) and `kept` is a member or `eval`, which
 * called there would get a receiver or evaluate in place (the function a
 * factory returns calls its implementation with none); else `kept`, in
 * parentheses when `needsParens` says.
 */
function keptText(
  code: string,
  kept: Node,
  original: Node,
  file: PlanContext['analysis']['file'],
): Array<Frag> {
  let n = original
  let p = file.parentOf(n)
  while (p && isExpressionWrapper(p) && p.expression === n) {
    n = p
    p = file.parentOf(p)
  }
  const value = unwrapExpression(kept)
  if (
    ((p?.type === 'CallExpression' && p.callee === n) ||
      (p?.type === 'TaggedTemplateExpression' && p.tag === n)) &&
    (value.type === 'MemberExpression' ||
      (value.type === 'Identifier' && value.name === 'eval'))
  ) {
    return [text('(0, '), slice(rangeOf(kept)), text(')')]
  }
  return needsParens(code, kept, original, file.parentOf(original))
    ? [text('('), slice(rangeOf(kept)), text(')')]
    : [slice(rangeOf(kept))]
}

/**
 * Whether a call continues the expression `node` once its wrappers and
 * member reads are stripped (`node.bind(x)`, `(node as T)()`,
 * `node.a.b\`…\``): an annotation before `node` would mark that call.
 */
function continuedByCall(
  file: PlanContext['analysis']['file'],
  node: Node,
): boolean {
  let n = node
  for (let p = file.parentOf(n); p; n = p, p = file.parentOf(p)) {
    if (
      (isExpressionWrapper(p) && p.expression === n) ||
      (p.type === 'MemberExpression' && p.object === n)
    ) {
      continue
    }
    return (
      ((p.type === 'CallExpression' || p.type === 'NewExpression') &&
        p.callee === n) ||
      (p.type === 'TaggedTemplateExpression' && p.tag === n)
    )
  }
  return false
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
  /** `.handler`'s type and argument lists (`<T>(fn)`): a split chunk's caller copy replaces them (R159). */
  handlerArgs: Range
  /** The `.handler(…)` call and what it is called on (the chain before it): the client stub's parts. */
  handlerCall: Node
  receiver: Node
  /**
   * `.handler`'s arguments, the first's start to the last's end (a trailing
   * comma outside): what an RPC stub replaces. The types allow one; a
   * further argument (with a cast) is code of the same call.
   */
  stubbed: Range
  base: string
  stableKey: string
  /** What a custom `generateFunctionId` receives (`handlerFunctionName`). */
  functionName: string
  /** Its position among the module's server fns, in source order. */
  ordinal: number
  /** The declared top-level symbol when the chain initialises a top-level declarator. */
  topLevelSym: SymbolId | null
  topLevelUnit: Unit | null
  nested: boolean
  /**
   * The provider wrapper: a binding and an export of the same name (an
   * export list `export { name }` survives tools that re-export bindings by
   * their local name), with the file's tag (`fileTag`). Allocated for every
   * site as it is found, before anything that differs between environments
   * (a nested site erased in one is skipped there), so every output names
   * the same function by it (the resolver of one environment imports the
   * wrapper another environment's registry entry names).
   */
  wrapper: { local: { name: string; sym: SymbolId }; exportName: string }
}

function describeServerFn(
  ctx: PlanContext,
  chain: Chain,
): {
  base: string
  nested: boolean
  topLevelSym: SymbolId | null
  topLevelUnit: Unit | null
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
    while (p && isExpressionWrapper(p)) {
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
            // (the RPC reads the fn from this binding: a written one holds another fn)
            if (
              units &&
              units.length > 0 &&
              !b.references.some((r) => r.isWrite)
            ) {
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
  return {
    base,
    nested: topLevelSym === null,
    topLevelSym,
    topLevelUnit,
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

declare module '@tanstack/router-utils/compiler' {
  interface PlannerData {
    /** The start-env planner's `PlannerData` (`START_ENV`); `startAnalysisOf` and the hosts read it too. */
    'start-env': {
      config: StartEnvConfig
      prefetch: StartPrefetch
      facts: StartEnvFacts
    }
  }
}

export function startEnvPlanner(opts?: {
  late: true
}): Planner<typeof START_ENV> {
  const table = startRecognizer()
  const answerFromRegistry = !cacheDisabled('registry')
  return {
    name: START_ENV,
    tier: 1,
    gate: (t0) => t0.hasImportOrExport,
    async prefetch(t0, ctx) {
      const result = await prefetchStartValues(t0, ctx, {
        table,
        late: opts?.late,
        answerFromRegistry,
      })
      ctx.set(result)
      return result.relevant
    },
    plan(ctx) {
      planStartEnv(ctx, ctx.config, table)
    },
    serverCode: (ctx) => startServerCode(ctx, table),
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
  // main's `filename`: pathe's `relative` (forward slashes, drive letters upper-cased, another drive absolute)
  const rootRel = relative(config.root, ctx.identity.path)
  // what the compile adds to an in-place provider's exports is tagged with the file (`fileTag`)
  let fileTag: string | undefined
  const tagOfFile = () => (fileTag ??= fileTagOf(rootRel))
  const facts: StartEnvFacts = { serverFns: [] }
  /** The server-only text the client compile erases (step 6's parameter check reads it). */
  const erased: Array<Range> = []

  const diag = (message: string, range: Range) =>
    ctx.diagnostic({ severity: 'error', message, range, by })

  // ---- derived provider output (RSC: the module as the separate provider env compiles it)
  let providerOut: OutputId | null = null
  const serverFnChains = analysis.chains.filter(
    (c) => c.terminalValue.t === 'serverFn' && !c.unsupported,
  )
  const derivesProvider = config.providerSeparate
  /** The registry's module of the file's server fns (R158 rule 3): by configuration and path only. */
  const provider: ProviderModule = config.late
    ? 'file'
    : derivesProvider
      ? 'derived'
      : 'lazy'
  if (config.late && derivesProvider && serverFnChains.length > 0) {
    // the provider module is derived from the file, which is no JavaScript
    diag(LATE_MESSAGE, rangeOf(serverFnChains[0]!.head))
  } else if (
    role === 'provider' &&
    derivesProvider &&
    serverFnChains.length > 0
  ) {
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
            },
          },
        ],
      })
      glue.set(key, sym)
    }
    return sym
  }

  // ---- lazy handler module (in-place provider): one per defining module, loaded once on the
  // first call; the registry imports every server fn's wrapper from it (R158 rule 3)
  let handlerOut: OutputId | null = null
  let handlerLoad: SymbolId | null = null
  const handlerOutput = (): OutputId =>
    (handlerOut ??= ctx.declareOutput({
      kind: 'custom',
      key: 'handler',
      derived: { kind: 'handler', value: '' },
    }))
  const lazyHandlerOutput = (): { out: OutputId; load: SymbolId } => {
    if (handlerLoad === null) {
      handlerOutput()
      const memo = names.alloc('tsrHandlers')
      const load = names.alloc('tsrLoadHandlers')
      const spec = sameFileSpecifier(derivedIdOf(handlerOut!))
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
    return { out: handlerOut!, load: handlerLoad }
  }

  // ---- 1. link stripping on the client (serverFn validators, middleware server/validator) and
  // in a lazy provider's split chunks (serverFn validators: the caller copies, R159)
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
        (recv.kind === 'serverFn' && link.method === 'validator') ||
        (recv.kind === 'middleware' &&
          (link.method === 'server' || link.method === 'validator'))
      if (!strip) {
        continue
      }
      if (link.arg === null) {
        diag(
          link.method === 'server'
            ? "A middleware's `.server()` must be called with its server implementation: `.server(async ({ next }) => next())`."
            : '`.validator()` must be called with a validator: a function (`.validator((data: string) => data)`) or a schema.',
          rangeOf(link.call),
        )
        continue
      }
      if (role === 'client') {
        erased.push(rangeOf(link.arg))
        // (the link goes with it)
        rewrites.placeholder({
          range: { start: link.member.object.end, end: link.call.end },
          body: [],
          scope: 'all-outputs',
          by,
        })
      } else if (provider === 'lazy' && recv.kind === 'serverFn') {
        // R159 rule 2: a split chunk's caller copy has no validator (it
        // runs in the server phase only), as the client's copy
        rewrites.placeholder({
          range: { start: link.member.object.end, end: link.call.end },
          body: [],
          scope: { kinds: ['split'] },
          by,
        })
      }
    }
  }

  // ---- 2. server fns
  const sites: Array<ServerFnSite> = []
  const keyCount = new Map<string, number>()
  const functionNames = new Set<string>()
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
        'Assign the server function to a variable (`const fn = createServerFn()…`), not a destructuring pattern.',
        rangeOf(described.destructured),
      )
      continue
    }
    if (handlerLink.arg === null) {
      diag(
        "`.handler()` must be called with the server function's implementation: `.handler(async ({ data }) => …)`.",
        rangeOf(chain.terminal),
      )
      continue
    }
    if (handlerLink.argIsSpread) {
      diag(
        '`.handler()` must be called with a function, not a spread argument.',
        rangeOf(handlerLink.arg),
      )
      continue
    }
    const baseKey = `${described.base || 'fn'}${described.path.length > 0 ? `@${described.path.join('/')}` : ''}`
    const n = keyCount.get(baseKey) ?? 0
    keyCount.set(baseKey, n + 1)
    const stableKey = n === 0 ? baseKey : `${baseKey}#${n}`
    const wrapperBase = providerExportBase(
      identifierBase(stableKey),
      tagOfFile(),
    )
    let wrapperName = wrapperBase
    for (
      let i = 1;
      !(names.isFree(wrapperName) && names.isExportNameFree(wrapperName));
      i++
    ) {
      wrapperName = `${wrapperBase}$${i}`
    }
    sites.push({
      chain,
      handler: handlerLink.arg,
      handlerArgs: { start: handlerLink.member.end, end: handlerLink.call.end },
      handlerCall: handlerLink.call,
      receiver: handlerLink.member.object,
      stubbed: {
        start: handlerLink.arg.start,
        end: handlerLink.call.arguments.at(-1)!.end,
      },
      base: described.base || 'fn',
      stableKey,
      functionName: handlerFunctionName(described.base || 'fn', functionNames),
      ordinal: sites.length,
      topLevelSym: described.topLevelSym,
      topLevelUnit: described.topLevelUnit,
      nested: described.nested,
      wrapper: {
        local: names.alloc(wrapperName),
        exportName: names.allocExportName(wrapperName),
      },
    })
  }

  // Handlers that move to the lazy handler module (in-place provider). The
  // rewrite of exactly such a handler (the handler is itself an env-only or
  // isomorphic call) is the handler's text: it renders in the handler
  // module.
  const lazySites = new Set<ServerFnSite>()
  if (role === 'provider' && !providerOut && sites.length > 0) {
    // the lazy handler module (and a shared module placement creates)
    // imports what the file keeps through glue exports
    ctx.tagGlueExports(tagOfFile())
  }
  if (
    role === 'provider' &&
    !providerOut &&
    sites.length > 0 &&
    // a module that awaits at its top level could await one of its own server fns while it
    // evaluates: a handler module importing anything of it would wait for it forever
    !hasTopLevelAwait(ctx) &&
    // (the handler module would read the file, which is no JavaScript)
    !config.late
  ) {
    for (const site of sites) {
      // a core fallback (the handler writes module state other code reads) keeps it in place
      if (ctx.fallbackAt(rangeOf(site.handler), 'custom') === undefined) {
        lazySites.add(site)
      }
    }
  }
  /** An environment rewrite: the text of the call, wherever it renders (a stubbed handler's place hides it). */
  const envEdit = (range: Range, body: Array<Frag>) => {
    rewrites.edit({ range, body, by })
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
    if (!isServer) {
      for (const l of chain.links) {
        if (l.method === 'server' && l.arg !== null) {
          // (erased with the rest of the chain, below)
          erased.push(rangeOf(l.arg))
        }
      }
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
      // (the edit replaces the terminal inside its wrappers: `x as T` keeps its `as`)
      envEdit(rangeOf(X), keptText(ctx.analysis.source.code, link.arg, X, file))
      continue
    }
    if (chain.headIsFactoryCall) {
      const parens = needsParens(
        ctx.analysis.source.code,
        'arrow',
        X,
        file.parentOf(X),
      )
      envEdit(rangeOf(X), [text(parens ? '(() => {})' : '() => {}')])
      continue
    }
    if (chain.links.length > 0) {
      // the implementation lives on the stored receiver (this module or another): strip this segment's links
      envEdit(
        rangeOf(X),
        keptText(ctx.analysis.source.code, chain.head, X, file),
      )
    }
  }

  // ---- 4. env-only fns
  for (const c of analysis.envOnlyCalls) {
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
      envEdit(
        rangeOf(c.call),
        keptText(ctx.analysis.source.code, c.arg, wrapped, file),
      )
    } else {
      if (c.arg !== null && c.kind === 'server') {
        // (the stub below is the call's text)
        erased.push(rangeOf(c.arg))
      }
      const message = `create${c.kind === 'server' ? 'Server' : 'Client'}OnlyFn() functions can only be called on the ${c.kind}!`
      const parens = needsParens(
        ctx.analysis.source.code,
        'arrow',
        wrapped,
        parent,
      )
      const stub = `() => { throw new Error(${stringLiteral(message, '"')}) }`
      envEdit(rangeOf(c.call), [text(parens ? `(${stub})` : stub)])
    }
  }

  // ---- 5. <ClientOnly> children on server envs
  // Except, in the env rendering server components (RSC), inside a server
  // fn's handler: a Flight render serialises `<ClientOnly>`'s props for the
  // browser, so the children travel in the payload and the browser renders
  // them after hydration. Elsewhere that env only evaluates the module, and
  // the children may read browser-only code, as on `main`
  if (isServer) {
    const rendersComponents = ctx.env.isProvider && config.providerSeparate
    for (const el of analysis.clientOnlyElements) {
      if (!el.closingElement) {
        continue
      }
      if (
        rendersComponents &&
        sites.some(
          (site) =>
            site.handler.start <= el.start && el.end <= site.handler.end,
        )
      ) {
        continue
      }
      rewrites.edit({
        range: { start: el.openingElement.end - 1, end: el.end },
        body: [text('/>')],
        by,
      })
    }
  }

  // ---- 2b. server fn rewrites
  // After steps 3-5: a nested server fn is hoisted (and its captures refused)
  // only where it is live (`hoist` reads the rewrite tree), so every edit
  // that can erase it must be recorded first: the handler stubs of step 2,
  // the isomorphic and env-only implementations of steps 3-4, the
  // `<ClientOnly>` children of step 5.
  let devRevision: string | undefined
  for (const site of sites) {
    const key = { rootRel, stableKey: site.stableKey }
    // a nested server fn is checked for hoistability in every env (J4.6: every env refuses
    // at the capture, or every env supports it); the hoist itself happens on the provider
    let hoisted: ReturnType<typeof hoist> = null
    if (site.nested) {
      hoisted = hoist(
        ctx,
        site,
        providerOut ?? 'auto',
        role === 'provider',
        by,
        ctx.identity.path.endsWith('.vue')
          ? (refused) => (facts.vueHoists ??= []).push(refused)
          : undefined,
      )
      if (!hoisted) {
        continue
      }
    }
    const id =
      config.idMode === 'dev'
        ? devFunctionId(key)
        : config.idMode === 'placeholder'
          ? placeholderId(key)
          : defaultFunctionId({ rootRel, functionName: site.functionName })
    const name = metaName(site)
    const h = site.handler
    // (the manifest's `functionName` stays `site.functionName`)
    const { local: rpcLocal, exportName } = site.wrapper
    if (role === 'client') {
      const rpc = glueImport(
        specs.clientRpc,
        'createClientServerFn',
        'tsrClientServerFn',
      )
      // in dev the stub also names its file's revision (an argument the runtime ignores): the
      // handler may have changed with any edit of the file, and a webpack-family host
      // hot-updates a module only when its output changed, so the client module of an edited
      // server fn changes and its route refreshes (Vite updates every module of the file)
      const revisionArg =
        config.idMode === 'dev'
          ? `, ${moduleLiteral((devRevision ??= revision(ctx.analysis.source.code)))}`
          : ''
      // the stub is a call of ours only, `createClientServerFn(id, chain)`
      // (the runtime calls `chain.handler(createClientRpc(id))`), marked
      // pure: a bundler drops an unused server fn's stub and its id (R182:
      // then not HTTP-callable), and keeps what the user's chain runs, an
      // argument of the call (the user's own `.handler()` call marked pure
      // would drop the effects of its callee: bundlers keep only an unused
      // pure call's arguments). Not marked where a user call continues it
      // (`….handler(fn).bind(x)`): the annotation marks the outermost call
      // after it, so that call's callee would go too (parentheses around
      // ours would scope it, but a later transform may print them away:
      // @swc/core does)
      const call = site.handlerCall
      erased.push(site.stubbed)
      rewrites.edit({
        range: rangeOf(call),
        body: [
          text(
            continuedByCall(file, call) ? '' : '/* @__PURE__ */ ',
            { sym: rpc, ctx: 'callee' },
            `(${moduleLiteral(id)}, `,
          ),
          slice(rangeOf(site.receiver)),
          text(`${revisionArg})`),
        ],
        by,
      })
      facts.serverFns.push(
        serverFnFact(site, id, name, exportName, provider, rootRel),
      )
      continue
    }
    if (role === 'ssr-caller' || providerOut) {
      const rpc = glueImport(specs.ssrRpc, 'createSsrRpc', 'tsrSsrRpc')
      // the handler's place: its text (an env-only or isomorphic call's,
      // compiled) renders in the provider output
      rewrites.placeholder({
        range: site.stubbed,
        body: [text({ sym: rpc, ctx: 'callee' }, `(${moduleLiteral(id)})`)],
        scope: role === 'ssr-caller' ? 'all-outputs' : envScope,
        by,
      })
      if (role === 'ssr-caller') {
        facts.serverFns.push(
          serverFnFact(site, id, name, exportName, provider, rootRel),
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
    let anchor: { k: 'before-unit'; unit: number }
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
      // the handler module evaluates the argument at the first call, `main`
      // when the chain is created: they differ for a binding the module
      // assigns elsewhere (R182: a warning, no other placement)
      const ref =
        h.type === 'Identifier'
          ? t1.refs.refsIn(rangeOf(h)).find((r) => r.range.start === h.start)
          : undefined
      if (ref && t1.mutation.isReassigned(ref.sym)) {
        const binding = ctx.symbols.name(ref.sym)
        ctx.diagnostic({
          severity: 'warning',
          message: `\`${binding}\` is read when the server function is first called, not when it is created: this module assigns \`${binding}\` elsewhere, so a call runs the function it holds at that moment. Pass a function written in place (\`.handler(async () => …)\`) or a \`const\`.`,
          range: rangeOf(h),
          by,
          code: 'start-handler-reassigned',
        })
      }
      const { out, load } = lazyHandlerOutput()
      const local = names.alloc(`tsrHandler$${identifierBase(site.stableKey)}`)
      const region = ctx.region(rangeOf(h), 'custom')
      const owner = rewrites.addGenerated({
        body: [
          text('const ', { sym: local.sym }, ' = '),
          { k: 'region', id: region },
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
        region,
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
      rewrites.insert({
        at: h.start,
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
          `({ id: ${moduleLiteral(id)}, name: ${moduleLiteral(name)}, filename: ${moduleLiteral(rootRel)} }, (`,
          { sym: opts.sym },
          ') => ',
          { sym: fnSym },
          '.__executeServer(',
          { sym: opts.sym },
          '))\n',
        ),
        // (the registry's module exports it: the lazy module re-exports it under this name)
        ...(provider === 'lazy'
          ? []
          : [text('export { ', { sym: rpcLocal.sym }, ' }\n')]),
      ],
      declares: [rpcLocal.sym],
      effectful: false,
      anchor,
      home,
      by,
    })
    if (provider === 'file') {
      // (the registry imports the file itself)
      ctx.addRoot('env', { t: 'gen', id: gen })
    }
    if (provider === 'lazy') {
      // R158 rules 1 and 3: the lazy module re-exports the wrapper, the
      // registry's one root; the file holds the server fn only when its own
      // code names it
      const out = handlerOutput()
      ctx.addRoot(out, {
        t: 'gen',
        id: rewrites.addGenerated({
          body: [
            text('export { ', { sym: rpcLocal.sym }, ` as ${exportName} }\n`),
          ],
          declares: [],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by,
        }),
      })
      // R159 rule 2: a split chunk's copy of a server fn is a caller (the
      // user's chain, its handler an RPC through the registry to the one
      // executing instance), as the client's copy and `main`'s chunk
      const rpc = glueImport(specs.ssrRpc, 'createSsrRpc', 'tsrSsrRpc')
      rewrites.placeholder({
        range: site.handlerArgs,
        body: [
          text('(', { sym: rpc, ctx: 'callee' }, `(${moduleLiteral(id)}))`),
        ],
        scope: { kinds: ['split'] },
        by,
      })
    }
    // the hoisted chain renders after its wrapper (the chain reads the wrapper eagerly)
    commitHoist?.()
    facts.serverFns.push(
      serverFnFact(site, id, name, exportName, provider, rootRel),
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

  // ---- 6. uses the compiler cannot follow, where the client output keeps them
  if (role === 'client') {
    for (const e of analysis.escapes) {
      const inputValidator = inputValidatorRead(e)
      ctx.liveDiagnostic({
        severity: 'error',
        message: inputValidator
          ? INPUT_VALIDATOR_MESSAGE
          : escapeMessage(e, ma.file),
        range: rangeOf(inputValidator ?? e.node),
        by,
        code: `start-escape:${e.reason}`,
      })
    }
    const prefetched = ctx.prefetched.get(START_ENV)
    for (const { range, reExport } of prefetched?.lateExports ?? []) {
      diag(reExport ? lateReExportMessage(reExport) : LATE_MESSAGE, range)
    }
    // an RSC primitive's argument is server code only a server fn's erasure removes
    for (const { call, kind } of analysis.rscCalls) {
      const api = RSC_APIS[kind]
      ctx.liveDiagnostic({
        severity: 'error',
        message: `\`${api}(…)\` is called outside a server function, so it and the components it renders would ship to the client. Call it inside a server function's \`.handler()\`, or in a helper wrapped in \`createServerOnlyFn(…)\` that only server code calls.`,
        range: rangeOf(call),
        by,
        code: 'start-escape:rsc',
      })
    }
    for (const { range, exported } of prefetched?.namespaceEscapes ?? []) {
      ctx.liveDiagnostic({
        severity: 'error',
        message: `This namespace object goes where the compiler cannot follow it, and its module exports \`${exported}\`, a TanStack Start builder or factory, so server code attached to it there would ship to the client. Import what you use by name, or read it directly (\`ns.${exported}\`).`,
        range,
        by,
        code: 'start-escape:namespace',
      })
    }
    if (config.late) {
      const late = lateEscapesOf(
        ma,
        analysis.escapes,
        prefetched?.namespaceEscapes ?? [],
      )
      if (late.length > 0) {
        facts.lateEscapes = late
      }
    }
    // a parameter that reaches server code: every call keeps its argument on the client
    // (a handler's captures are refused by `hoist`)
    const params = new Map<
      SymbolId,
      { name: Node; fn: Node; direct: Node | null }
    >()
    for (const text of erased) {
      for (const { kind, sym, range } of t1.refs.refsIn(text)) {
        const param =
          kind === 'value' &&
          !ctx.symbols.isModuleLevel(sym) &&
          parameterOf(ctx, sym, text)
        if (!param) {
          continue
        }
        const code = unwrapExpression(nodeOn(ctx, text)!)
        const direct =
          code.type === 'Identifier' && code.start === range.start ? code : null
        if (!params.get(sym)?.direct) {
          params.set(sym, { ...param, direct })
        }
      }
    }
    // (judged at the function: a pattern property only erased code read is pruned)
    for (const [sym, { name, fn, direct }] of params) {
      const param = ctx.symbols.name(sym)
      if (direct) {
        ctx.liveDiagnostic(
          {
            severity: 'error',
            message: `\`${param}\` is passed as server code here, so what callers pass for it is server code, and every call keeps its argument on the client. Write the server code at each call instead of passing it through a function.`,
            range: rangeOf(direct),
            by,
            code: 'start-escape:server-param',
          },
          { at: rangeOf(fn) },
        )
      } else {
        ctx.liveDiagnostic(
          {
            severity: 'warning',
            message: `The parameter \`${param}\` is read only by server-only code, but what each call passes for it stays in the client bundle. That is fine for values that are not secret (a role name, a flag); read secrets inside the server code instead of passing them.`,
            range: rangeOf(name),
            by,
            code: 'start-server-param',
          },
          {
            at: rangeOf(fn),
            unlessLive: t1.refs.valueRefsOf(sym).map((r) => r.range),
          },
        )
      }
    }
  }

  ctx.setFacts(START_ENV, facts)
}

/** The node on exactly `range`. */
function nodeOn(ctx: PlanContext, range: Range): Node | null {
  for (
    let n = ctx.t1.nodeAt(range.start);
    n;
    n = ctx.analysis.file.parentOf(n)
  ) {
    if (n.start === range.start && n.end === range.end) {
      return n
    }
    if (n.start < range.start || n.end > range.end) {
      return null
    }
  }
  return null
}

/**
 * The name node of `sym` when it is a parameter (or a binding of a
 * parameter's pattern) of a function strictly enclosing `text`, with that
 * function.
 */
function parameterOf(
  ctx: PlanContext,
  sym: SymbolId,
  text: Range,
): { name: Node; fn: Node } | null {
  const name = ctx.symbols.binding(sym)?.declarations[0]
  if (!name) {
    return null
  }
  for (const fn of ctx.analysis.file.ancestors(name)) {
    if (isFunctionNode(fn)) {
      const isParam = fn.params.some((p) =>
        patternIdentifiers(p).some((id) => id === name),
      )
      // (of a function strictly enclosing the text: not the text's own parameters)
      return isParam &&
        fn.start <= text.start &&
        text.end <= fn.end &&
        (fn.start < text.start || text.end < fn.end)
        ? { name, fn }
        : null
    }
  }
  return null
}

/** The API of each RSC primitive a call is, for a message. */
const RSC_APIS = {
  'rsc:render': 'renderServerComponent',
  'rsc:composite': 'createCompositeComponent',
  'rsc:stream': 'renderToReadableStream',
} as const

const LATE_MESSAGE =
  'Another plugin compiles this module from a file that is not JavaScript (`.mdx`, `.vue`, `.svelte`, …), so the TanStack Start compiler only sees its output and cannot keep the server code of a TanStack Start builder or factory used here out of the client. Define it in a `.ts`/`.tsx` module and import what it creates.'

/** A late-pass module re-exports an open builder (`LateExport.reExport`): import it from its own module. */
function lateReExportMessage({
  from,
  whole,
  name,
}: NonNullable<LateExport['reExport']>): string {
  const what =
    name === null
      ? `what \`${from}\` exports, TanStack Start builders or factories among it`
      : whole
        ? `what \`${from}\` exports, among it \`${name}\`, a TanStack Start builder or factory`
        : `\`${name}\`, a TanStack Start builder or factory, from \`${from}\``
  return `This module re-exports ${what}, and another plugin compiles this module from a file that is not JavaScript (\`.mdx\`, \`.vue\`, \`.svelte\`, …), so the TanStack Start compiler cannot follow it through this module, and server code attached to it would ship to the client. Import ${name === null ? 'what you use' : `\`${name}\``} from \`${from}\` where you use it, and remove the re-export from this file.`
}

const FLOW_PLACES =
  'passed to a function, stored in an object, an array, a class field or another variable, awaited, rendered…'

const RETURNED_FROM: Record<NonNullable<Escape['returnedFrom']>, string> = {
  isoFn:
    'returned from an isomorphic implementation, whose calls the compiler does not follow',
  clientOnlyFn:
    'returned from a `createClientOnlyFn` implementation, whose calls the compiler does not follow',
}

const FINISH_MIDDLEWARE = '`.server(({ next }) => next())`'

const KEEPS_SERVER_BEHAVIOUR =
  '`.server(() => undefined)` keeps what it does on the server now (without one, it returns `undefined` there).'

const ESCAPE_MESSAGES: Record<EscapeReason, string> = {
  flow: 'A TanStack Start builder or factory is used where the compiler cannot follow it (passed to a function, stored in an object, an array, a class field or another variable, awaited, rendered…), so server code attached to it there would ship to the client. Call its factories directly where you need them, and finish each builder (`.handler(…)`, `.server(…)`) on its chain or on the `const` holding it.',
  computed:
    "A TanStack Start builder's method is read through a computed key (`b['handler']`), which the compiler cannot compile, so server code attached through it would ship to the client. Call it directly: `.handler(…)`, `.server(…)`.",
  member:
    'Call the methods of a TanStack Start builder directly (`.handler(…)`, `.server(…)`, `.middleware([…])`): a method read off the builder, `.call` / `.bind`, or another member cannot be compiled, so server code attached through it would ship to the client.',
  return:
    'A function that returns a TanStack Start builder must return it from its single top-level `return` (or an arrow body) and must not be async, a generator, a method or a getter: the compiler cannot follow it otherwise, so server code attached to the builder would ship to the client. Split it into one factory per builder.',
  reassigned:
    'A variable holding a TanStack Start builder or factory is reassigned, so the compiler cannot tell what it holds where it is used, and server code attached to it would ship to the client. Store builders in a `const`.',
  pattern:
    'A TanStack Start builder or factory is destructured in a form the compiler cannot follow (only `const { createServerFn } = Start` style names of a Start namespace or start instance can be), so server code attached to it would ship to the client. Call its methods directly.',
}

/**
 * The bindings the late pass's refused escapes hand on (`StartEnvFacts.lateEscapes`):
 * an escape of an identifier, and a namespace escape (of the import it reads).
 */
function lateEscapesOf(
  ma: PlanContext['analysis'],
  escapes: ReadonlyArray<Escape>,
  namespaceEscapes: ReadonlyArray<NamespaceEscape>,
): Array<LateEscape> {
  const { file } = ma
  const out: Array<LateEscape> = []
  const handsOn = (
    at: number,
    binding: ReturnType<typeof file.bindingOf> | undefined,
  ) => {
    const declaration = binding?.declarations[0]
    if (declaration) {
      out.push({ at, name: binding.name, declaration: rangeOf(declaration) })
    }
  }
  for (const e of escapes) {
    if (e.node.type === 'Identifier') {
      handsOn(e.node.start, file.bindingOf(e.node))
    }
  }
  for (const { range } of namespaceEscapes) {
    handsOn(
      range.start,
      ma.imports
        .flatMap((imp) => imp.specifiers)
        .map((spec) => (spec.local < 0 ? undefined : file.bindings[spec.local]))
        .find((binding) =>
          binding?.references.some(
            ({ node }) => node.start >= range.start && node.end <= range.end,
          ),
        ),
    )
  }
  return out
}

const INPUT_VALIDATOR_MESSAGE =
  "`.inputValidator()` was renamed to `.validator()` (same arguments) and is no longer supported: call `.validator(…)`. See the 'Migrate from the Release Candidate' guide. When a dependency calls it, update that package to a version that uses `.validator()`."

function escapeMessage(
  e: Escape,
  file: PlanContext['analysis']['file'],
): string {
  if (e.reason === 'flow') {
    const assigned = assignedTo(file, e.node)
    if (assigned !== null && e.value.t === 'builder') {
      return `\`${assigned}\` is assigned a TanStack Start builder after its declaration, so the compiler cannot tell what it holds where it is used, and server code attached to it would ship to the client. Declare it with the builder: \`const ${assigned} = …\`.`
    }
    return flowMessage(e)
  }
  if (
    e.reason === 'member' &&
    isOptionsMember(e.node) &&
    e.value.t === 'builder' &&
    (e.value.kind === START_KINDS.serverFn ||
      e.value.kind === START_KINDS.middleware)
  ) {
    return optionsMessage(e.node)
  }
  if (
    e.reason === 'return' &&
    e.value.t === 'factory' &&
    e.node.type === 'Identifier'
  ) {
    return `\`${e.node.name}\` is a TanStack Start factory, returned from ${returningFunction(file, e.node)}, whose result the compiler does not follow, so server code attached to what it creates would ship to the client. Call \`${e.node.name}\` directly where you need what it creates, instead of returning it: the compiler follows each call's chain.`
  }
  const message = ESCAPE_MESSAGES[e.reason]
  if (e.reason === 'computed' || e.reason === 'member') {
    return message
  }
  if (isOpenMiddleware(e.value)) {
    return `${message} Or end the middleware's chain with ${FINISH_MIDDLEWARE}.`
  }
  if (isIsoFnWithoutServer(e.value)) {
    return `${message} Or give the isomorphic fn a \`.server()\` implementation where it is defined: ${KEEPS_SERVER_BEHAVIOUR}`
  }
  return message
}

/** A builder's `.options` (the compile allows reading options by name only: `start-analysis.ts`). */
function isOptionsMember(
  node: Node,
): node is Extract<Node, { type: 'MemberExpression' }> {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'options'
  )
}

function optionsMessage(
  node: Extract<Node, { type: 'MemberExpression' }>,
): string {
  const object = unwrapExpression(node.object)
  const named = object.type === 'Identifier' ? `${object.name}.options` : null
  return `${named ? `\`${named}\`` : "A builder's `.options`"} is used where the compiler cannot follow it (passed on, stored, written to, or its \`middleware\` list read), so server code attached to the builder through it would ship to the client. Read each option you need by name where you use it (\`${named ?? '.options'}.method\`).`
}

/** What the function returning `node` is, for a message: why the compiler does not follow its result. */
function returningFunction(
  file: PlanContext['analysis']['file'],
  node: Node,
): string {
  for (const fn of file.ancestors(node)) {
    if (!isFunctionNode(fn)) {
      continue
    }
    const p = file.parentOf(fn)
    const kind =
      p?.type === 'MethodDefinition' ||
      (p?.type === 'Property' && p.value === fn)
        ? p.kind
        : null
    if (kind === 'get') {
      return 'a getter'
    }
    if (kind === 'set') {
      return 'a setter'
    }
    if (kind !== null) {
      return 'a method'
    }
    return fn.async
      ? 'an async function'
      : fn.generator
        ? 'a generator'
        : 'a function with several `return`s or one under control flow'
  }
  return 'a function'
}

/**
 * The variable `node` is assigned to by a statement (`x = node`, both sides
 * through the wrappers of `isExpressionWrapper`: `(x as T) = node`), or null.
 */
function assignedTo(
  file: PlanContext['analysis']['file'],
  node: Node,
): string | null {
  let child = node
  let a = file.parentOf(node)
  while (a && isExpressionWrapper(a)) {
    child = a
    a = file.parentOf(a)
  }
  if (
    a?.type !== 'AssignmentExpression' ||
    file.parentOf(a)?.type !== 'ExpressionStatement' ||
    a.operator !== '=' ||
    a.right.start !== child.start ||
    a.right.end !== child.end
  ) {
    return null
  }
  const target = unwrapExpression(a.left)
  return target.type === 'Identifier' ? target.name : null
}

/** A middleware builder without `.server()`: server code can still be attached to it. */
function isOpenMiddleware(v: AbstractValue): boolean {
  return (
    v.t === 'builder' &&
    v.kind === START_KINDS.middleware &&
    !v.links.some((l) => l.method === 'server')
  )
}

/** An isomorphic fn without a `.server()` implementation: one can still be attached to it. */
function isIsoFnWithoutServer(v: AbstractValue): boolean {
  return (
    (v.t === 'isoFn' || (v.t === 'builder' && v.kind === START_KINDS.isoFn)) &&
    !v.links.some((l) => l.method === 'server')
  )
}

/** What a value server code can still be attached to is, for a message. */
function describeOpen(v: AbstractValue): string {
  if (isOpenMiddleware(v)) {
    return 'a middleware without `.server()`'
  }
  if (isIsoFnWithoutServer(v)) {
    return 'an isomorphic fn without a `.server()` implementation'
  }
  if (v.t === 'builder' && v.kind === START_KINDS.serverFn) {
    return 'a server fn builder without `.handler()`'
  }
  return 'a TanStack Start builder'
}

/**
 * A `flow` escape, by what the value is: the fix that compiles for it. An
 * open middleware compiles where Start reads it as data or with a
 * `.server()` of its own; an isomorphic fn with a `.server()`. Not
 * `createClientOnlyFn`: it is no middleware, and where an isomorphic fn
 * goes the compiler cannot tell whether it is called on the server, where
 * that throws instead of returning `undefined`.
 */
function flowMessage(e: Escape): string {
  const v = e.value
  const name = e.node.type === 'Identifier' ? `\`${e.node.name}\`` : null
  const is = (what: string) =>
    name
      ? `${name} is ${what}, used`
      : `${what[0]!.toUpperCase()}${what.slice(1)} is used`
  const where = `where the compiler cannot follow it (${
    e.returnedFrom ? RETURNED_FROM[e.returnedFrom] : FLOW_PLACES
  })`
  if (isOpenMiddleware(v)) {
    const open = `${is(describeOpen(v))} ${where}, so the compiler cannot be sure no \`.server()\` is attached to it there, which would ship server code to the client.`
    const direct =
      "to `.middleware([…])` or to `createStart`'s `functionMiddleware` / `requestMiddleware` directly (or in an unexported `const` array only they read)"
    // a `.server()` of its own compiles there, but such a list reaching Start throws on the server
    return e.returnedFrom === 'clientOnlyFn'
      ? `${open} \`createClientOnlyFn\` throws when called on the server, and Start reads middleware lists there too: pass the middleware ${direct}.`
      : `${open} To attach its server code later, keep it in its own \`const\` (export it to share it) and call \`.server(…)\` on that \`const\`. Otherwise pass it ${direct}, or end its chain with ${FINISH_MIDDLEWARE}.`
  }
  if (isIsoFnWithoutServer(v)) {
    return `${is(describeOpen(v))} ${where}, so the compiler cannot be sure no \`.server()\` implementation is attached to it there, which would ship server code to the client. Give it one where it is defined: ${KEEPS_SERVER_BEHAVIOUR}`
  }
  switch (v.t) {
    case 'builder':
      return `${is(describeOpen(v))} ${where}, so a handler attached to it there would ship to the client. Keep the builder in its own \`const\` (export it to share it) and call \`.handler(…)\` on that \`const\` where you define each server function, or call \`.handler(…)\` before passing it on.`
    case 'factory':
      return `${is('a TanStack Start factory')} ${where}, so server code attached to what it creates there would ship to the client. Call it directly where you need what it creates: the compiler follows each call's chain, and the \`const\` holding it.`
    case 'startInstance':
      return `${is('a start instance')} ${where}, so server code attached there to a middleware it creates would ship to the client. Call its \`.createMiddleware()\` directly where you need a middleware.`
    case 'function':
    case 'isoFn': {
      // (an isomorphic fn with a `.server()`: what it returns takes server code)
      const what = describeOpen(v.returns ?? v)
      const subject = name
        ? `${name} returns ${what}, and is used`
        : `A function returning ${what} is used`
      return `${subject} ${where}, so server code attached to what it returns there would ship to the client. Call it directly where you use its result: the compiler follows a call of it like the value it returns.`
    }
    default:
      return ESCAPE_MESSAGES.flow
  }
}

/** The `inputValidator` name of `.inputValidator` read off a server fn or middleware builder. */
function inputValidatorRead({ reason, node, value }: Escape): Node | null {
  return reason === 'member' &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'inputValidator' &&
    value.t === 'builder' &&
    (value.kind === START_KINDS.serverFn ||
      value.kind === START_KINDS.middleware)
    ? node.property
    : null
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
  provider: ProviderModule,
  rootRel: string,
): ServerFnFact {
  return {
    rootRel,
    stableKey: site.stableKey,
    functionName: site.functionName,
    ordinal: site.ordinal,
    id,
    exportName,
    name,
    provider,
  }
}

/** The chain a terminal stands for: the last operand of a sequence, inside the wrappers a value passes unchanged (`isExpressionWrapper`). */
function chainExpression(terminal: Node): Node {
  let n = terminal
  for (;;) {
    if (n.type === 'SequenceExpression') {
      n = n.expressions.at(-1)!
    } else if (isExpressionWrapper(n)) {
      n = n.expression
    } else {
      return n
    }
  }
}

/** Why a server fn's position is refused (`loadPosition`), as the message says it. */
/** The cause of a refusal of a server fn in a function, whatever it reads (R162); what it reads decides the fix. */
const NESTED =
  'A server function must be created exactly once, when its module loads: this one is inside a function'

const REFUSED_POSITION = {
  function:
    'inside a function, so it would be created each time the function runs',
  conditional: 'under a condition, so it may never be created',
  repeated: 'in a loop, so it may be created several times or never',
  block: 'in a block (`try`, `switch`, a namespace or `{ … }`)',
  instance:
    'in a class instance field, so it would be created for each instance',
  default: 'a default value, used only when the value is `undefined`',
} as const

/**
 * Whether the top-level statement holding `node` evaluates it exactly once,
 * unconditionally, when the module loads (R162), and that statement. Every
 * expression position the statement evaluates is once and unconditional
 * (an operand, an argument, a callee, a member's object, an entry, a key,
 * a template's or JSX's expression, a spread, a sequence's operand, an
 * assignment's right-hand side and so a declarator's initialiser, a class's
 * static parts, a top-level `await`'s operand), except where the language
 * may skip it, repeat it or run it later, which the path from the
 * statement to `node` must not pass (`refusedKind`).
 */
function loadPosition(
  file: PlanContext['analysis']['file'],
  node: Node,
):
  | { k: 'once'; statement: Node }
  | { k: 'refused'; why: keyof typeof REFUSED_POSITION } {
  /**
   * The reason the message gives: a function around it (its body is a block,
   * its code a condition's or a loop's), else the first refused position
   * that is no block (an `if` or a loop holds its body in one).
   */
  let why: keyof typeof REFUSED_POSITION | null = null
  let n = node
  let p = file.parentOf(n)
  while (p !== null && p.type !== 'Program') {
    const here = refusedKind(p, n)
    if (here === 'function') {
      return { k: 'refused', why: here }
    }
    if (here !== null && (why === null || why === 'block')) {
      why = here
    }
    n = p
    p = file.parentOf(n)
  }
  if (p === null) {
    return { k: 'refused', why: why ?? 'block' }
  }
  return why === null ? { k: 'once', statement: n } : { k: 'refused', why }
}

/**
 * Why `p` may skip, repeat or defer evaluating its part `n`, or null when
 * it evaluates `n` once whenever it is evaluated itself (the closed half of
 * R162: every kind not listed is such a position).
 */
function refusedKind(p: Node, n: Node): keyof typeof REFUSED_POSITION | null {
  switch (p.type) {
    // a body or a default parameter value runs when the function is called
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return 'function'
    // a branch runs only when the test selects it (the test always runs)
    case 'ConditionalExpression':
      return p.test === n ? null : 'conditional'
    // the right operand runs only when the left does not decide (`&&`, `||`, `??`)
    case 'LogicalExpression':
      return p.right === n ? 'conditional' : null
    // a logical assignment's right-hand side runs only when the target does not decide
    case 'AssignmentExpression':
      return p.right === n &&
        (p.operator === '&&=' || p.operator === '||=' || p.operator === '??=')
        ? 'conditional'
        : null
    // what follows a `?.` in its chain runs only when the value before is not nullish
    case 'CallExpression':
      return n !== p.callee && (p.optional || optionalBefore(p.callee))
        ? 'conditional'
        : null
    case 'MemberExpression':
      return n !== p.object && optionalBefore(p) ? 'conditional' : null
    // a destructuring default runs only when the value is `undefined`
    case 'AssignmentPattern':
      return p.right === n ? 'default' : null
    // an instance field's initialiser runs for each instance (static: once, with the class)
    case 'PropertyDefinition':
    case 'AccessorProperty':
      return p.value === n && !p.static ? 'instance' : null
    // a branch runs only when its test selects it
    case 'IfStatement':
      return 'conditional'
    // a loop's parts run several times or never
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return 'repeated'
    // a block, `try` / `catch` / `finally`, a `switch` and a namespace's body
    // are statements the module does not run as one evaluation
    case 'BlockStatement':
    case 'TryStatement':
    case 'CatchClause':
    case 'SwitchStatement':
    case 'SwitchCase':
    case 'TSModuleBlock':
    case 'TSModuleDeclaration':
      return 'block'
    default:
      return null
  }
}

/** Whether a member or call chain holds a `?.` link up to `n` (parentheses end the chain). */
function optionalBefore(n: Node): boolean {
  for (let c: Node = n; ; ) {
    if (c.type === 'MemberExpression') {
      if (c.optional) {
        return true
      }
      c = c.object as Node
    } else if (c.type === 'CallExpression') {
      if (c.optional) {
        return true
      }
      c = c.callee as Node
    } else if (
      c.type === 'TSNonNullExpression' ||
      c.type === 'TSInstantiationExpression'
    ) {
      c = c.expression
    } else {
      return false
    }
  }
}

/** A private name (`#x`) the code of `node` reads of a class around it, if any (none of a class `node` itself declares). */
function privateNameOutside(node: Node): (Node & { name: string }) | null {
  const found: { node: (Node & { name: string }) | null } = { node: null }
  walk(node, {
    enter: (n, wctx) => {
      if (found.node) {
        wctx.stop()
        return
      }
      if (
        n.type === 'PrivateIdentifier' &&
        !wctx
          .ancestors()
          .some(
            (a) =>
              a !== node && a.start >= node.start && a.type === 'ClassBody',
          )
      ) {
        found.node = n as Node & { name: string }
      }
    },
  })
  return found.node
}

/**
 * The first `this`, `super`, `new.target` or `arguments` (and, with `awaits`,
 * `await` or `yield`) in `node` that belongs to the code around it, not to a
 * function or a class of its own.
 */
function enclosingCallCode(
  node: Node,
  /** Whether an identifier refers to a declared binding (an `arguments` the code declares). */
  bound: (n: Node) => boolean,
  awaits = true,
): Node | null {
  const found: { node: Node | null } = { node: null }
  walk(node, {
    enter: (n, wctx) => {
      if (found.node) {
        wctx.stop()
        return
      }
      const inside = (types: ReadonlyArray<string>) =>
        wctx
          .ancestors()
          .some(
            (a) =>
              a !== node && a.start >= node.start && types.includes(a.type),
          )
      switch (n.type) {
        case 'ThisExpression':
        case 'Super':
        case 'MetaProperty':
        case 'Identifier':
          if (
            (n.type !== 'MetaProperty' || n.meta.name === 'new') &&
            (n.type !== 'Identifier' ||
              (n.name === 'arguments' && !bound(n))) &&
            !inside(['FunctionExpression', 'FunctionDeclaration', 'ClassBody'])
          ) {
            found.node = n
          }
          break
        case 'AwaitExpression':
        case 'YieldExpression':
          if (
            awaits &&
            !inside([
              'FunctionExpression',
              'FunctionDeclaration',
              'ArrowFunctionExpression',
            ])
          ) {
            found.node = n
          }
          break
        default:
          break
      }
    },
  })
  return found.node
}

/** How a message names the code `enclosingCallCode` found. */
function ownedWord(n: Node): string {
  return n.type === 'ThisExpression'
    ? 'this'
    : n.type === 'Super'
      ? 'super'
      : n.type === 'MetaProperty'
        ? 'new.target'
        : n.type === 'AwaitExpression'
          ? 'await'
          : n.type === 'YieldExpression'
            ? 'yield'
            : 'arguments'
}

/**
 * Hoists a server-fn chain that is no top-level declarator's value to module
 * level on the server (J4.6, R162): the chain region is claimed by a
 * generated `const` placed immediately above the top-level statement holding
 * it, in the module that keeps that statement, the occurrence becomes a
 * reference to it. Only a chain its statement evaluates exactly once,
 * unconditionally, when the module loads (`loadPosition`) moves, so it is
 * created as often and in the same order as the source creates it, before
 * the rest of its own statement. Refuses, positioned, a chain in any other
 * position (with the local it captures in a function, if any), one reading a
 * name only the code around it sees (a static block's local, a class
 * expression's own name), `this`/`super`/`new.target`/`arguments` or a
 * private name of the class it is in, and one reading, when the module
 * loads, a binding not initialised yet where it is created (its own
 * statement or a later one declares it: `symbols.initialisation`).
 */
function hoist(
  ctx: PlanContext,
  site: ServerFnSite,
  home: 'auto' | OutputId,
  provider: boolean,
  by: string,
  /** Records a refusal (a Vue SFC's module: `StartEnvFacts.vueHoists`). */
  recordRefusal?: (refused: VueHoist) => void,
): {
  sym: SymbolId
  anchor: { k: 'before-unit'; unit: number }
  /** Adds the hoist unit and its claim (called after the wrapper unit exists, so it renders first). */
  commit: () => void
} | null {
  const { t1, symbols, names, rewrites } = ctx
  const file = ctx.analysis.file
  // (the chain itself: a sequence's earlier operands stay where its
  // statement evaluates them, `(0, createServerFn()…)`)
  const X = chainExpression(site.chain.terminal)
  const xRange = rangeOf(X)
  // the claim is dead where the enclosing code is erased: no diagnostics
  // there. Except on the provider: what it erases may run on the client
  // (`createClientOnlyFn`, `<ClientOnly>` children), which calls the server
  // fn, so the provider still serves it
  if (
    !provider &&
    ctx.liveness(home === 'auto' ? 'env' : home).isErased(xRange)
  ) {
    return null
  }
  const refuse = (
    message: string,
    range: Range,
    why?: Omit<VueHoist, 'at'>,
  ) => {
    ctx.diagnostic({
      severity: 'error',
      message,
      range,
      by,
      code: 'start-hoist',
    })
    recordRefusal?.({ at: range.start, ...why })
    return null
  }
  const captures = t1.capturesOf(xRange)
  const firstCapture = () => {
    const first = t1.refs.refsIn(xRange).find((r) => captures.includes(r.sym))
    return { first, name: symbols.name(first ? first.sym : captures[0]!) }
  }
  // created exactly once, unconditionally, when the module loads (R162)
  const position = loadPosition(file, X)
  if (position.k === 'refused') {
    if (position.why === 'function' && captures.length > 0) {
      // a capture of the enclosing function: the fix names it
      const { first, name } = firstCapture()
      // `base.handler(…)` with `const base = createServerFn()` in the function
      const builder =
        !!first &&
        !site.chain.headIsFactoryCall &&
        first.range.start === site.chain.head.start
      return refuse(
        builder
          ? `${NESTED} and is built on \`${name}\`, a local of that function. Define the server function at the module top level, with \`${name}\` there too (export it to share it), or as one chain there: \`export const fn = createServerFn().handler(…)\`.`
          : `${NESTED} and reads \`${name}\`, a local of that function. Define it at the module top level and pass \`${name}\` in its input: declare it with \`.validator()\` and call the server function with \`{ data: … }\`.`,
        first ? first.range : xRange,
        { reads: { name, builder } },
      )
    }
    const bound = (n: Node) => !!file.referenceOf(n)?.binding
    const owned =
      position.why === 'function' ? enclosingCallCode(X, bound) : null
    if (owned) {
      const what = ownedWord(owned)
      return refuse(
        what === 'await' || what === 'yield'
          ? `${NESTED} and uses \`${what}\` of that function outside its handler. Define it at the module top level.`
          : `${NESTED} and uses \`${what}\` of that function. Define it at the module top level and pass what it reads from \`${what}\` in its input: declare it with \`.validator()\` and call the server function with \`{ data: … }\`.`,
        rangeOf(owned),
      )
    }
    return refuse(
      `A server function must be created exactly once, when its module loads: this one is ${REFUSED_POSITION[position.why]}. Define it at the module top level (\`export const fn = createServerFn()…\`) and pass what it needs as its input.`,
      xRange,
    )
  }
  // a name only the code around it sees: a class static block's local, the
  // name a class expression gives itself (the hoisted `const` is outside)
  if (captures.length > 0) {
    const { first, name } = firstCapture()
    const scope = symbols.scopeRange(first ? first.sym : captures[0]!)
    let owner: Node | null = file.parentOf(X)
    while (
      owner !== null &&
      !(scope && owner.start === scope.start && owner.end === scope.end)
    ) {
      owner = file.parentOf(owner)
    }
    const what =
      owner?.type === 'StaticBlock'
        ? 'a local of the class static block it is written in'
        : owner?.type === 'ClassExpression'
          ? 'the name the class expression around it gives itself'
          : 'a name of the code around it'
    return refuse(
      `A server function cannot be compiled when its code reads \`${name}\`, ${what}: the server function is created at the module top level, where \`${name}\` does not exist. Declare what it reads at the module top level, above the statement holding the server function, or pass it in its input.`,
      first ? first.range : xRange,
    )
  }
  // `this`, `super`, `new.target`, `arguments` of a class's static parts: the
  // class's own, which the hoisted `const` outside the class does not have
  // (at the module top level they mean the same there)
  let classAround = false
  for (let a = file.parentOf(X); a !== null; a = file.parentOf(a)) {
    if (a.type === 'ClassBody') {
      classAround = true
      break
    }
  }
  const classCode = classAround
    ? enclosingCallCode(X, (n) => !!file.referenceOf(n)?.binding, false)
    : null
  if (classCode) {
    return refuse(
      `A server function cannot be compiled when its code uses \`${ownedWord(classCode)}\` of the class it is written in: the server function is created at the module top level, outside the class. Read the class by its name in the handler, or declare what it reads above the class.`,
      rangeOf(classCode),
    )
  }
  // a private name of a class the chain is written in cannot leave it (d19)
  const privateName = privateNameOutside(X)
  if (privateName) {
    return refuse(
      `A server function cannot be compiled when its code reads \`#${privateName.name}\`, a private name of the class it is written in: the server runs it outside the class. Define it at the module top level and read the value through a static method or a module-level binding.`,
      rangeOf(privateName),
    )
  }
  const statement = position.statement
  const own = t1.items.find(
    (it) => it.range.start <= statement.start && statement.start < it.range.end,
  )!
  // what the chain reads when the module loads has the value there that the
  // source reads: the hoisted `const` evaluates it before its own statement
  // runs (what a function of the chain reads, its handler's code included,
  // runs when it is called)
  const functions: Array<Range> = []
  walk(X, {
    enter: (n) => {
      if (
        n.type === 'FunctionExpression' ||
        n.type === 'FunctionDeclaration' ||
        n.type === 'ArrowFunctionExpression'
      ) {
        functions.push(rangeOf(n))
      }
    },
  })
  for (const r of t1.refs.refsIn(xRange)) {
    if (
      functions.some((f) => r.range.start >= f.start && r.range.end <= f.end) ||
      !symbols.isModuleLevel(r.sym)
    ) {
      continue
    }
    const declaring = (t1.declaringUnits.get(r.sym) ?? [])
      .map((u) => t1.units[u]!)
      .filter((u) => u.kind !== 'import-specifier' && u.item >= own.index)
    // (`Initialisation`: an import or a function declaration has its value
    // before any statement runs; a `var` is `undefined` until its declarator
    // runs, which only a declarator of its own statement before the chain
    // has done in the source; a `let`, a `const` or a class its own statement
    // or a later one declares is not initialised yet)
    const initialisation = symbols.initialisation(r.sym)
    const differs =
      initialisation === 'declaration'
        ? declaring.length > 0
        : initialisation === 'undefined' &&
          declaring.some((u) => u.item === own.index && u.range.start < X.start)
    if (differs) {
      const name = symbols.name(r.sym)
      return refuse(
        `A server function cannot be created before \`${name}\` is initialised: its own statement or a later one declares it, and the server function reads it when the module loads, before that declaration runs. Declare \`${name}\` above the statement holding the server function, or read it in a function (the handler, a validator).`,
        r.range,
      )
    }
  }
  const anchor = { k: 'before-unit', unit: own.units[0]! } as const
  const hoisted = names.alloc(`tsrServerFn$${identifierBase(site.base)}`)
  const commit = () => {
    const region = ctx.region(xRange, 'nested-chain')
    const owner: GenUnitId = rewrites.addGenerated({
      body: [
        text('const ', { sym: hoisted.sym }, ' = '),
        { k: 'region', id: region },
        text('\n'),
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor,
      // (where its statement runs, at the anchor: never moved to a shared or
      // derived module, which would create it before every statement of the
      // file; the other outputs import it, as what the file keeps)
      home: home === 'auto' ? 'env' : home,
      by,
    })
    rewrites.claim({
      region,
      owner,
      // (mapped to the chain: the reference stands for it, a bare statement
      // included, whose whole text the claim takes)
      placeholder: [
        { k: 'text', parts: [{ sym: hoisted.sym }], mapTo: X.start },
      ],
      // (homed in a provider output: the env module keeps the chain in place,
      // with its handler's stub, instead of importing the hoisted binding,
      // which would evaluate the provider module and what its handlers
      // import in this env)
      ...(home === 'auto' ? {} : { scope: { except: ['env'] } }),
      by,
      subject:
        'a server function written in place, which TanStack Start moves to the module top level',
    })
  }
  return { sym: hoisted.sym, anchor, commit }
}
