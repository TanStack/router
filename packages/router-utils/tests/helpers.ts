/**
 * Test planners and an in-memory host for the core tests. The planners are
 * toys: they exercise the engine's interfaces (claims, outputs, edits, edge
 * policy, prefetch) without implementing the real J2–J6 behaviour.
 */
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
} from '../src/compiler'
import type {
  CompileInput,
  CompileOutput,
  CompilerCaches,
  EnvInfo,
  Frag,
  HostServices,
  PlanContext,
  Planner,
  Range,
  SymbolId,
  Unit,
} from '../src/compiler'
import type { Node } from 'yuku'

export const ROUTER_SPEC = 'toy-router'

export function envInfo(partial: Partial<EnvInfo> = {}): EnvInfo {
  return {
    name: 'client',
    type: 'client',
    mode: 'dev',
    ...partial,
  }
}

/** Finds the `Route` declarator unit and the options object of `createFileRoute(...)(opts)`. */
export function findRouteOptions(
  ctx: PlanContext,
): { unit: Unit; options: Node } | null {
  const { analysis, t1 } = ctx
  const exp = analysis.exports.find(
    (e) => e.kind === 'local' && e.name === 'Route',
  )
  if (!exp || exp.kind !== 'local' || exp.local === null) {
    return null
  }
  const uid = t1.declaringUnits.get(exp.local)?.[0]
  if (uid === undefined) {
    return null
  }
  const unit = t1.units[uid]!
  const node = unit.node
  if (
    node.type !== 'VariableDeclarator' ||
    !node.init ||
    node.init.type !== 'CallExpression'
  ) {
    return null
  }
  const arg = node.init.arguments[0]
  if (!arg || arg.type !== 'ObjectExpression') {
    return null
  }
  return { unit, options: arg }
}

export function propertyOf(
  options: Node,
  key: string,
): { prop: Node; value: Node } | null {
  if (options.type !== 'ObjectExpression') {
    return null
  }
  for (const p of options.properties) {
    if (
      p.type === 'Property' &&
      !p.computed &&
      p.key.type === 'Identifier' &&
      p.key.name === key
    ) {
      return { prop: p, value: p.value }
    }
  }
  return null
}

/** The range of a property including its separating comma (removing it leaves a valid object). */
export function propertyRangeWithComma(options: Node, prop: Node): Range {
  if (options.type !== 'ObjectExpression') {
    throw new Error('not an object')
  }
  const idx = options.properties.indexOf(prop as never)
  const next = options.properties[idx + 1]
  if (next) {
    return { start: prop.start, end: next.start }
  }
  // last property: include the comma before it when present
  const prev = options.properties[idx - 1]
  if (prev) {
    return { start: prev.end, end: prop.end }
  }
  return { start: prop.start, end: prop.end }
}

export interface ToySplitOptions {
  /** Option keys to split (default ['component']). */
  keys?: Array<string>
  /** Option keys erased from the env output only (deleteNodes). */
  deleteNodes?: Array<string>
  /** Whether to add a dev HMR-like hoist of an inline component (claim → chunk). */
  hoist?: boolean
  /** Allow every exported declaration but the route into an extracted-export output (§3.5.3). */
  extractExports?: boolean
  /**
   * An identifier option value is replaced by an env-scoped edit (the real
   * splitter's shape: the binding travels by placement and the chunk roots
   * it as a symbol) instead of a claim.
   */
  identifierEdits?: boolean
  /** Export the id of the module each chunk takes an identifier value from (`export const home = …`, a `homeId` ref). */
  homeIds?: boolean
}

/**
 * Toy route splitter: splits `component` of `createFileRoute(...)({...})` into
 * `?tsr-split=component`, rooting the placeholder in the env module and the
 * option value in the chunk through a claim.
 */
export function toySplitPlanner(opts: ToySplitOptions = {}): Planner {
  const keys = opts.keys ?? ['component']
  return {
    name: 'toy-split',
    tier: 1,
    gate: (t0) => t0.imports.some((i) => i.specifier === ROUTER_SPEC),
    plan(ctx) {
      const found = findRouteOptions(ctx)
      if (!found) {
        return
      }
      ctx.setRouteModule()
      ctx.markBenignEffect(found.unit.id)
      const code = ctx.analysis.source.code
      const { options, unit } = found
      if (opts.extractExports) {
        for (const e of ctx.analysis.exports) {
          if (e.kind !== 'local' || e.local === null || e.typeOnly) {
            continue
          }
          const sym = e.local
          if (unit.declares.includes(sym)) {
            continue // the route itself stays, as the real splitter has it
          }
          const name = ctx.symbols.name(sym)
          const out = ctx.declareOutput({
            kind: 'export',
            key: `export~${name}`,
            derived: { kind: 'export', value: name },
            sideEffectFree: true,
          })
          ctx.extract(sym, out)
        }
      }
      for (const key of opts.deleteNodes ?? []) {
        const p = propertyOf(options, key)
        if (p) {
          ctx.rewrites.add({
            range: propertyRangeWithComma(options, p.prop),
            body: [],
            scope: ['env'],
            by: 'toy-split',
          })
        }
      }
      let lazyImportSym: SymbolId | null = null
      const reasons: Record<string, string> = {}
      for (const key of keys) {
        const p = propertyOf(options, key)
        if (!p) {
          continue
        }
        const valueRange = { start: p.value.start, end: p.value.end }
        // an identifier value: the binding is the chunk's root (the core
        // reports it when its effects keep it in the env module)
        const valueBinding =
          p.value.type === 'Identifier'
            ? (ctx.analysis.file.referenceOf(p.value)?.binding ?? null)
            : null
        const valueSym = valueBinding
          ? ctx.symbols.ofBinding(valueBinding)
          : null
        const declaringRanges =
          valueSym === null
            ? []
            : (ctx.t1.declaringUnits.get(valueSym) ?? []).map(
                (u) => ctx.t1.regions.get(ctx.t1.units[u]!.region).range,
              )
        const fallback = ctx.fallbacks.find(
          (f) =>
            (f.range.start === valueRange.start &&
              f.range.end === valueRange.end) ||
            declaringRanges.some(
              (r) => r.start === f.range.start && r.end === f.range.end,
            ),
        )
        if (fallback) {
          reasons[key] = fallback.reason
          ctx.setFacts('toy-split', { notSplittable: key, reasons })
          continue
        }
        const output = ctx.declareOutput({
          kind: 'split',
          key,
          derived: { kind: 'split', value: key },
        })
        const derivedId = output.slice('derived:'.length)
        const pascal = key.charAt(0).toUpperCase() + key.slice(1)
        const split = ctx.names.alloc(`TsrSplit${pascal}`)
        const importer = ctx.names.alloc(`tsrImport${pascal}`)
        if (lazyImportSym === null) {
          lazyImportSym = ctx.names.alloc('lazyRouteComponent').sym
        }
        const spec = `./${derivedId.slice(derivedId.lastIndexOf('/') + 1)}`
        // the importer const: `const tsrImportX = () => import('<chunk>')`, after the header, placed by needers
        ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: [`const ${importer.name} = () => import(`] },
            {
              k: 'spec',
              specifier: spec,
              edgeKey: ctx.edgeKey(spec, 'dynamic', 'runtime'),
              provenance: { origin: 'runtime' },
              form: 'dynamic',
            },
            { k: 'text', parts: [')\n'] },
          ],
          declares: [importer.sym],
          effectful: false,
          anchor: { k: 'after-header' },
          home: 'auto',
          by: 'toy-split',
          imports: [
            {
              names: [{ imported: 'lazyRouteComponent', local: lazyImportSym }],
              spec: {
                k: 'spec',
                specifier: ROUTER_SPEC,
                edgeKey: ctx.edgeKey(ROUTER_SPEC, 'static', 'runtime'),
                provenance: { origin: 'runtime' },
              },
            },
          ],
        })
        // the chunk unit owning the option value
        const owner = ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: [`const ${split.name} = `] },
            { k: 'slice', range: valueRange },
            { k: 'text', parts: [`\nexport { ${split.name} as ${key} }\n`] },
            ...(opts.homeIds && valueSym !== null
              ? [
                  {
                    k: 'text' as const,
                    parts: [
                      'export const home = ',
                      { sym: valueSym, ctx: 'homeId' as const },
                      '\n',
                    ],
                  },
                ]
              : []),
          ],
          declares: [split.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: output,
          by: 'toy-split',
        })
        if (valueSym !== null) {
          ctx.addRoot(output, { t: 'sym', id: valueSym })
        }
        const placeholder: Array<Frag> = [
          {
            k: 'text',
            parts: [
              '/* @__PURE__ */ ',
              { sym: lazyImportSym, ctx: 'callee' },
              '(',
              { sym: importer.sym },
              `, '${key}')`,
            ],
          },
        ]
        if (opts.identifierEdits && valueSym !== null) {
          ctx.rewrites.add({
            range: valueRange,
            body: placeholder,
            scope: ['env'],
            by: 'toy-split',
          })
          continue
        }
        ctx.rewrites.claim({
          region: ctx.region(valueRange, 'option-value'),
          owner,
          placeholder,
          by: 'toy-split',
        })
      }
      void unit
    },
  }
}

/**
 * Toy "replace this call with text retaining a child slice" planner: every
 * `wrapServer(fn)` call becomes `tsrRpc(<fn>)` with the argument retained
 * (nested edits inside it still apply) on the server; on the client the
 * argument is erased and the call becomes `tsrStub()`.
 */
export function toyEnvPlanner(spec = 'toy-start'): Planner {
  return {
    name: 'toy-env',
    tier: 1,
    gate: (t0) => t0.imports.some((i) => i.specifier === spec),
    plan(ctx) {
      const { analysis, t1, env } = ctx
      for (const imp of analysis.imports) {
        if (imp.specifier !== spec) {
          continue
        }
        for (const s of imp.specifiers) {
          const refs = t1.refs.refsOf(s.local).filter((r) => r.ctx === 'callee')
          for (const ref of refs) {
            const node = t1.nodeAt(ref.range.start)
            const call = node ? t1.parentOf(node) : null
            if (!call || call.type !== 'CallExpression') {
              continue
            }
            const arg = call.arguments[0]
            if (!arg) {
              continue
            }
            if (s.imported === 'wrapServer') {
              if (env.type === 'server') {
                ctx.rewrites.add({
                  range: { start: call.start, end: call.end },
                  body: [
                    { k: 'text', parts: ['tsrRpc('] },
                    { k: 'slice', range: { start: arg.start, end: arg.end } },
                    { k: 'text', parts: [')'] },
                  ],
                  scope: 'all-outputs',
                  by: 'toy-env',
                })
              } else {
                ctx.rewrites.add({
                  range: { start: call.start, end: call.end },
                  body: [{ k: 'text', parts: ['tsrStub()'] }],
                  scope: 'all-outputs',
                  by: 'toy-env',
                })
              }
            } else if (s.imported === 'clientOnly') {
              if (env.type === 'client') {
                ctx.rewrites.add({
                  range: { start: call.start, end: call.end },
                  body: [
                    { k: 'slice', range: { start: arg.start, end: arg.end } },
                  ],
                  scope: 'all-outputs',
                  by: 'toy-env',
                })
              } else {
                ctx.rewrites.add({
                  range: { start: call.start, end: call.end },
                  body: [{ k: 'text', parts: ['(() => {})'] }],
                  scope: 'all-outputs',
                  by: 'toy-env',
                })
              }
            }
          }
        }
      }
    },
  }
}

export interface ToyEdgePolicyOptions {
  /** Specifier predicate for denied imports (default: `.server` in the specifier) on the client. */
  denied?: (specifier: string) => boolean
  /** Async verdict; false = leave the edge untouched. */
  onViolation?: (info: {
    specifier: string
    importerId: string
    output: string
  }) => Promise<boolean> | boolean
  mockId?: (specifier: string, edgeKey: string) => string
}

/** Toy async edge policy: denied specifiers are substituted by a mock id unless vetoed. */
export function toyEdgePolicyPlanner(
  opts: ToyEdgePolicyOptions = {},
): Planner & {
  calls: Array<{ specifier: string; importerId: string; output: string }>
} {
  const denied = opts.denied ?? ((s: string) => /\.server(\.|$|\?)/.test(s))
  const calls: Array<{
    specifier: string
    importerId: string
    output: string
  }> = []
  return {
    name: 'toy-edges',
    tier: 0,
    calls,
    gate: (t0) => t0.hasImportOrExport,
    async policy(_plan, output, edges, ctx) {
      if (ctx.env.type !== 'client') {
        return
      }
      for (const e of edges) {
        if (e.provenance.origin === 'runtime' || !denied(e.specifier)) {
          continue
        }
        const info = {
          specifier: e.specifier,
          importerId: e.importerId,
          output,
        }
        const verdict = await ctx.memo(`${e.edgeKey}`, async () => {
          calls.push(info)
          return opts.onViolation ? await opts.onViolation(info) : true
        })
        if (verdict === false) {
          continue
        }
        ctx.substitute(
          e.edgeKey,
          (opts.mockId ?? ((s, k) => `\0tsr-mock:${k.slice(0, 8)}:${s}`))(
            e.specifier,
            e.edgeKey,
          ),
        )
      }
    },
    plan() {},
  }
}

/**
 * Toy consumer planner: prefetches the summaries of relative imports and
 * records a fact per import (`kind` of `make` export), so a consumer's plan
 * depends on its dependencies' export facts.
 */
export function toySummaryPlanner(): Planner {
  return {
    name: 'toy-summary',
    tier: 1,
    gate: (t0) => t0.imports.some((i) => i.specifier.startsWith('.')),
    async prefetch(t0, ctx) {
      const facts: Record<string, unknown> = {}
      for (const imp of t0.imports) {
        if (!imp.specifier.startsWith('.')) {
          continue
        }
        const target = await ctx.resolve(imp.specifier)
        if (!target) {
          continue
        }
        const r = await ctx.resolver.resolve(target, 'make')
        facts[imp.specifier] = r.k === 'found' ? r.value : r.k
      }
      ctx.set(facts)
    },
    plan(ctx) {
      ctx.setFacts('toy-summary', ctx.prefetched.get('toy-summary') ?? null)
    },
  }
}

// ---------------------------------------------------------------------------
// in-memory host
// ---------------------------------------------------------------------------

export interface MemoryHostOptions {
  files: Record<string, string>
  /** Custom resolver; default: relative specifiers against the importer's directory with `.ts`/`.tsx` probing. */
  resolve?: (
    specifier: string,
    importer: string,
    files: Record<string, string>,
  ) => string | null
  /** Hook to suspend reads (overlapping-save tests). */
  onRead?: (path: string) => Promise<void> | void
  /** Hook to suspend resolutions. */
  onResolve?: (specifier: string, importer: string) => Promise<void> | void
  recognizer?: ConstructorParameters<typeof RawFactsCache>[0]['recognizer']
  markerSpecifiers?: ConstructorParameters<
    typeof RawFactsCache
  >[0]['markerSpecifiers']
}

export class MemoryHost implements HostServices {
  readonly files: Record<string, string>
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  readonly resolveCalls: Array<{ specifier: string; importer: string }> = []
  private readonly opts: MemoryHostOptions

  constructor(opts: MemoryHostOptions) {
    this.opts = opts
    this.files = { ...opts.files }
    this.rawFacts = new RawFactsCache({
      readFile: (p) => this.readFile(p),
      loadVirtual: () => Promise.resolve(null),
      recognizer: opts.recognizer,
      markerSpecifiers: opts.markerSpecifiers,
    })
    this.caches = createCompilerCaches(this.rawFacts)
  }

  async resolve(
    specifier: string,
    importer: string,
  ): Promise<{ id: string } | null> {
    this.resolveCalls.push({ specifier, importer })
    await this.opts.onResolve?.(specifier, importer)
    if (this.opts.resolve) {
      const r = this.opts.resolve(specifier, importer, this.files)
      return r ? { id: r } : null
    }
    if (!specifier.startsWith('.')) {
      return null
    }
    const base = importer.split('?')[0]!
    const dir = base.slice(0, base.lastIndexOf('/'))
    const joined = normalize(`${dir}/${specifier}`)
    for (const cand of [
      joined,
      `${joined}.ts`,
      `${joined}.tsx`,
      `${joined}/index.ts`,
    ]) {
      if (cand in this.files) {
        return { id: cand }
      }
    }
    return null
  }

  async readFile(path: string): Promise<string | null> {
    await this.opts.onRead?.(path)
    return this.files[path] ?? null
  }

  loadVirtual(): Promise<string | null> {
    return Promise.resolve(null)
  }

  write(path: string, code: string): void {
    this.files[path] = code
  }

  compile(
    id: string,
    planners: Array<Planner>,
    extra: Partial<CompileInput> = {},
  ): Promise<CompileOutput | null> {
    const path = id.split('?')[0]!
    const code = extra.code ?? this.files[path]
    if (code === undefined) {
      throw new Error(`no such file: ${path}`)
    }
    return compileModule(
      {
        id,
        code,
        inputMap: extra.inputMap,
        lang: extra.lang,
        env: extra.env ?? envInfo(),
        planners,
        config: extra.config ?? { configKey: 'cfg', perPlanner: {} },
        wantMap: extra.wantMap ?? true,
      },
      this,
      this.caches,
    )
  }
}

function normalize(p: string): string {
  const parts: Array<string> = []
  for (const seg of p.split('/')) {
    if (seg === '' && parts.length > 0) {
      continue
    }
    if (seg === '.') {
      continue
    }
    if (seg === '..') {
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return parts.join('/')
}

export function dedent(s: string): string {
  const lines = s.replace(/^\n/, '').split('\n')
  const indent = Math.min(
    ...lines
      .filter((l) => l.trim().length > 0)
      .map((l) => l.match(/^ */)![0].length),
  )
  return lines.map((l) => l.slice(indent)).join('\n')
}

/**
 * Toy Hydrate planner (Solid flavour): every `<Hydrate>…</Hydrate>` element's
 * children become a fixed-home chunk `?tss-hydrate=h<n>` whose component takes
 * `props`; captures are forwarded through the substitution environment, inner
 * boundaries first (bottom-up).
 */
export function toyHydratePlanner(hydrateSpec = 'toy-start'): Planner {
  return {
    name: 'toy-hydrate',
    tier: 1,
    gate: (t0) =>
      t0.imports.some(
        (i) =>
          i.specifier === hydrateSpec &&
          i.specifiers.some((s) => s.imported === 'Hydrate'),
      ),
    plan(ctx) {
      const { t1, analysis } = ctx
      const imp = analysis.imports.find((i) => i.specifier === hydrateSpec)
      const spec = imp?.specifiers.find((s) => s.imported === 'Hydrate')
      if (!spec) {
        return
      }
      const boundaries: Array<{ element: Node; children: Range }> = []
      for (const ref of t1.refs.refsOf(spec.local)) {
        if (ref.ctx !== 'jsxOpen') {
          continue
        }
        const name = t1.nodeAt(ref.range.start)
        const opening = name ? t1.parentOf(name) : null
        const element = opening ? t1.parentOf(opening) : null
        if (
          !element ||
          element.type !== 'JSXElement' ||
          element.children.length === 0
        ) {
          continue
        }
        const first = element.children[0]!
        const last = element.children[element.children.length - 1]!
        boundaries.push({
          element,
          children: { start: first.start, end: last.end },
        })
      }
      // innermost first
      boundaries.sort((a, b) => b.children.start - a.children.start)
      const props = ctx.names.alloc('props')
      const placeholders = new Map<number, Array<SymbolId>>() // children.start → captures of that boundary
      boundaries.forEach((b, i) => {
        const n = boundaries.length - 1 - i
        const region = ctx.region(b.children, 'hydrate-children')
        const out = ctx.declareOutput({
          kind: 'hydrate',
          key: `h${n}`,
          derived: { kind: 'hydrate', value: `h${n}` },
        })
        const comp = ctx.names.alloc(`TsrHydrate${n}`, { jsxTag: true })
        const captures = new Set<SymbolId>(t1.capturesOf(b.children))
        for (const [start, caps] of placeholders) {
          if (start > b.children.start && start < b.children.end) {
            for (const c of caps) {
              const scope = ctx.symbols.scopeRange(c)
              if (
                !scope ||
                scope.start < b.children.start ||
                scope.end > b.children.end
              ) {
                captures.add(c)
              }
            }
          }
        }
        const capList = [...captures]
        placeholders.set(b.children.start, capList)
        const env = new Map(
          capList.map((c) => [
            c,
            { member: [props.sym, ctx.symbols.name(c)] as [SymbolId, string] },
          ]),
        )
        const lazy = ctx.symbols.declare(comp.name)
        const owner = ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [
                'export function ',
                { sym: comp.sym },
                '(',
                { sym: props.sym },
                ') { return <>',
              ],
            },
            { k: 'slice', range: b.children },
            { k: 'text', parts: ['</> }\n'] },
          ],
          declares: [comp.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          env,
          by: 'toy-hydrate',
        })
        const parts: Array<string | { sym: SymbolId; ctx?: 'jsxTag' }> = [
          '<',
          { sym: lazy, ctx: 'jsxTag' },
        ]
        for (const c of capList) {
          parts.push(` ${ctx.symbols.name(c)}={`, { sym: c }, '}')
        }
        parts.push('/>')
        ctx.rewrites.claim({
          region,
          owner,
          placeholder: [{ k: 'text', parts }],
          by: 'toy-hydrate',
        })
        // the lazy const in the parent, placed by needers; same name as the chunk component, its own symbol
        const lazySpec = `./${analysis.path.slice(analysis.path.lastIndexOf('/') + 1)}?tss-hydrate=h${n}`
        ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: ['const ', { sym: lazy }, ' = tsrLazy(() => import('],
            },
            {
              k: 'spec',
              specifier: lazySpec,
              edgeKey: ctx.edgeKey(lazySpec, 'dynamic', 'runtime'),
              provenance: { origin: 'runtime' },
              form: 'dynamic',
            },
            { k: 'text', parts: [`), '${comp.name}')\n`] },
          ],
          declares: [lazy],
          effectful: false,
          anchor: { k: 'after-header' },
          home: 'auto',
          by: 'toy-hydrate',
        })
      })
    },
  }
}
