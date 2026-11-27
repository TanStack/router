/**
 * Test planners and an in-memory host for the core tests. The planners are
 * toys: they exercise the engine's interfaces (claims, outputs, edits, edge
 * policy, prefetch) without implementing the real J2–J6 behaviour.
 */
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
  invalidate,
  sameFileSpecifier,
  settleModule,
} from '../src/compiler'
import type {
  CompileInput,
  CompileOutput,
  CompilerCaches,
  EnvInfo,
  HostServices,
  InvalidateChange,
  PlanContext,
  Planner,
  Settlement,
  Unit,
} from '../src/compiler'
import type { Node } from 'yuku'

export const ROUTER_SPEC = 'toy-router'

/** The paths in the stale sets of every environment that compiled, taken: sorted, once each. */
export function takeStale(caches: CompilerCaches): Array<string> {
  const out = new Set<string>()
  for (const env of caches.plans.keys()) {
    for (const path of caches.stale.take(env)) {
      out.add(path)
    }
  }
  return [...out].sort()
}

/** What one invalidation made stale (`takeStale` after it; what was stale before is taken first). */
export async function staleAfter(
  caches: CompilerCaches,
  change: InvalidateChange,
  hosts: Parameters<typeof invalidate>[2],
): Promise<Array<string>> {
  takeStale(caches)
  await invalidate(caches, change, hosts)
  return takeStale(caches)
}

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

/**
 * Toy route splitter: splits `component` of `createFileRoute(...)({...})` into
 * `?tsr-split=component`, rooting the placeholder in the env module and the
 * option value in the chunk through a claim (an identifier value roots its
 * binding in the chunk too). A value placement reports a fallback for stays.
 */
export function toySplitPlanner(): Planner {
  const key = 'component'
  return {
    name: 'toy-split',
    tier: 1,
    gate: (t0) => t0.imports.some((i) => i.specifier === ROUTER_SPEC),
    plan(ctx) {
      const found = findRouteOptions(ctx)
      const p = found ? propertyOf(found.options, key) : null
      if (!p) {
        return
      }
      const valueRange = { start: p.value.start, end: p.value.end }
      // an identifier value: the binding is the chunk's root (the core
      // reports it when its effects keep it in the env module)
      const valueBinding =
        p.value.type === 'Identifier'
          ? (ctx.analysis.file.referenceOf(p.value)?.binding ?? null)
          : null
      const valueSym = valueBinding ? ctx.symbols.ofBinding(valueBinding) : null
      const declaringRanges =
        valueSym === null
          ? []
          : (ctx.t1.declaringUnits.get(valueSym) ?? []).map(
              (u) => ctx.t1.units[u]!.range,
            )
      const fallback =
        ctx.fallbackAt(valueRange) ??
        declaringRanges
          .map((r) => ctx.fallbackAt(r))
          .find((f) => f !== undefined)
      if (fallback) {
        ctx.setFacts('toy-split', { notSplittable: key })
        return
      }
      const output = ctx.declareOutput({
        kind: 'split',
        key,
        derived: { kind: 'split', value: key },
      })
      const derivedId = output.slice('derived:'.length)
      const split = ctx.names.alloc('TsrSplitComponent')
      const importer = ctx.names.alloc('tsrImportComponent')
      const lazy = ctx.names.alloc('lazyRouteComponent').sym
      const spec = sameFileSpecifier(derivedId)
      // the importer const: `const tsrImportX = () => import('<chunk>')`, after the header, placed by needers
      ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: [`const ${importer.name} = () => import(`] },
          {
            k: 'spec',
            specifier: spec,
            edgeKey: ctx.edgeKey(spec, 'dynamic', 'runtime'),
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
            names: [{ imported: 'lazyRouteComponent', local: lazy }],
            spec: {
              k: 'spec',
              specifier: ROUTER_SPEC,
              edgeKey: ctx.edgeKey(ROUTER_SPEC, 'static', 'runtime'),
            },
          },
        ],
      })
      // the chunk unit owning the option value
      const region = ctx.region(valueRange, 'option-value')
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: [`const ${split.name} = `] },
          { k: 'region', id: region },
          { k: 'text', parts: [`\nexport { ${split.name} as ${key} }\n`] },
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
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [
          {
            k: 'text',
            parts: [
              '/* @__PURE__ */ ',
              { sym: lazy, ctx: 'callee' },
              '(',
              { sym: importer.sym },
              `, '${key}')`,
            ],
          },
        ],
        by: 'toy-split',
      })
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
                ctx.rewrites.edit({
                  range: { start: call.start, end: call.end },
                  body: [
                    { k: 'text', parts: ['tsrRpc('] },
                    { k: 'slice', range: { start: arg.start, end: arg.end } },
                    { k: 'text', parts: [')'] },
                  ],
                  by: 'toy-env',
                })
              } else {
                ctx.rewrites.edit({
                  range: { start: call.start, end: call.end },
                  body: [{ k: 'text', parts: ['tsrStub()'] }],
                  by: 'toy-env',
                })
              }
            } else if (s.imported === 'clientOnly') {
              if (env.type === 'client') {
                ctx.rewrites.edit({
                  range: { start: call.start, end: call.end },
                  body: [
                    { k: 'slice', range: { start: arg.start, end: arg.end } },
                  ],
                  by: 'toy-env',
                })
              } else {
                ctx.rewrites.edit({
                  range: { start: call.start, end: call.end },
                  body: [{ k: 'text', parts: ['(() => {})'] }],
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

/**
 * Toy consumer planner: prefetches the summaries of relative imports and
 * records a fact per import (`kind` of `make` export), so a consumer's plan
 * depends on its dependencies' export facts.
 */
export function toySummaryPlanner(): Planner {
  const reads = (specifier: string) => specifier.startsWith('.')
  return {
    name: 'toy-summary',
    tier: 1,
    gate: (t0) => t0.imports.some((i) => reads(i.specifier)),
    async prefetch(t0, ctx) {
      const facts: Record<string, unknown> = {}
      for (const imp of t0.imports) {
        if (!reads(imp.specifier)) {
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
  ) => string | { id: string; external: true } | null
  /** The host's `resolveKey` (a resolver that sees less than the importer). */
  resolveKey?: (importerCanonicalId: string) => string
  /** Hook to suspend reads (overlapping-save tests). */
  onRead?: (path: string) => Promise<void> | void
  /** Hook to suspend resolutions. */
  onResolve?: (specifier: string, importer: string) => Promise<void> | void
  recognizer?: ConstructorParameters<typeof RawFactsCache>[0]['recognizer']
  markerSpecifiers?: ConstructorParameters<
    typeof RawFactsCache
  >[0]['markerSpecifiers']
  /** Texts of virtual modules (`loadVirtual`), by id. */
  virtual?: Record<string, string>
}

export class MemoryHost implements HostServices {
  readonly files: Record<string, string>
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  readonly resolveCalls: Array<{ specifier: string; importer: string }> = []
  private readonly opts: MemoryHostOptions
  /** A modification time per written file: the count of writes so far, at its last write. */
  private readonly writtenAt = new Map<string, number>()
  private writes = 0

  readonly resolveKey?: (importerCanonicalId: string) => string

  constructor(opts: MemoryHostOptions) {
    this.opts = opts
    this.resolveKey = opts.resolveKey
    this.files = { ...opts.files }
    this.rawFacts = new RawFactsCache({
      readFile: (p) => this.readFile(p),
      modifiedAt: (p) => Promise.resolve(this.writtenAt.get(p) ?? null),
      loadVirtual: (id) => Promise.resolve(opts.virtual?.[id] ?? null),
      recognizer: opts.recognizer,
      markerSpecifiers: opts.markerSpecifiers,
    })
    this.caches = createCompilerCaches(this.rawFacts)
  }

  async resolve(
    specifier: string,
    importer: string,
  ): Promise<{ id: string; external?: boolean } | null> {
    this.resolveCalls.push({ specifier, importer })
    await this.opts.onResolve?.(specifier, importer)
    if (this.opts.resolve) {
      const r = this.opts.resolve(specifier, importer, this.files)
      return typeof r === 'string' ? { id: r } : r
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
    this.writtenAt.set(path, ++this.writes)
  }

  compile(
    id: string,
    planners: Array<Planner>,
    extra: Partial<CompileInput> = {},
  ): Promise<CompileOutput | null> {
    return compileModule(this.inputOf(id, planners, extra), this, this.caches)
  }

  /** `settleModule` of a request as `compile` makes it; `use` runs while it is open. */
  settle<T>(
    id: string,
    planners: Array<Planner>,
    use: (settlement: Settlement) => T | Promise<T>,
    extra: Partial<CompileInput> = {},
  ): Promise<T> {
    return settleModule(
      this.inputOf(id, planners, extra),
      this,
      this.caches,
      use,
    )
  }

  private inputOf(
    id: string,
    planners: Array<Planner>,
    extra: Partial<CompileInput>,
  ): CompileInput {
    const path = id.split('?')[0]!
    const code = extra.code ?? this.files[path]
    if (code === undefined) {
      throw new Error(`no such file: ${path}`)
    }
    return {
      id,
      code,
      inputMap: extra.inputMap,
      lang: extra.lang,
      inPlace: extra.inPlace,
      env: extra.env ?? envInfo(),
      planners,
      config: extra.config ?? { configKey: 'cfg', perPlanner: {} },
      wantMap: extra.wantMap ?? true,
      lines: extra.lines,
    }
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
