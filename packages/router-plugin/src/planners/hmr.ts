/**
 * The route HMR part of the router planner (SPEC J3; the runtime side is
 * `hmr.ts` of router-core and the framework routers), in a development
 * client only.
 *
 * Before the split part (`planHmrHoists`): records the compile-time name of
 * each component option that stays in the route module (`unsplit`, every
 * framework); for React, every such option becomes a registrable binding —
 * inline values are hoisted into `const Tsr<Key> = …` before the statement
 * holding the options (a claim, so the original body is relocated, not
 * reprinted), lowercase module-level components are renamed module-wide.
 * After it (`planHmrBlock`): the dev block, with the literal
 * `import.meta.hot.accept(` (Vite) / `import.meta.webpackHot.accept()`, the
 * `__tsrRouteHmr(routeId, Route, meta)` call that runs on every evaluation,
 * and, for React on Vite, the refresh anchor export.
 */
import {
  stringLiteral,
  unwrapExpression,
} from '@tanstack/router-utils/compiler'
import {
  identifierSymbol,
  isAlreadyLazy,
  isFallbackLiteral,
  pascal,
  routerRouteId,
} from './route'
import { methodPrefixOf } from './decisions'
import { ROUTER_PLANNER, routeRefreshMarkers } from './config'
import type { HmrStyle } from './config'
import type { RouterRound } from './router'
import type {
  Frag,
  PlanContext,
  SymbolId,
} from '@tanstack/router-utils/compiler'

const HMR_COMPONENT_KEYS: ReadonlyArray<string> = [
  'component',
  'shellComponent',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

function isCapitalised(name: string): boolean {
  const c = name.charCodeAt(0)
  return c >= 65 && c <= 90
}

/**
 * Before the split part: makes every component option that stays in the
 * route module a binding React Refresh registers, and records its
 * compile-time name (`round.unsplit`, every framework).
 */
export function planHmrHoists(ctx: PlanContext, round: RouterRound): void {
  const { cfg, route, plan } = round
  if (route.kind === 'lazy' || route.options.kind !== 'object') {
    return
  }
  const split = new Set(plan.decisions.map((d) => d.key))
  // the split option values that name a binding: the splitter's own
  // edit replaces those occurrences (a ref edit there would collide)
  const splitRegions = plan.decisions
    .filter(
      (d) =>
        d.shape === 'shorthand' || identifierSymbol(ctx, d.valueNode) !== null,
    )
    .map((d) => d.region)
  const { names, symbols } = ctx
  for (const option of route.props) {
    if (
      option.key === null ||
      !HMR_COMPONENT_KEYS.includes(option.key) ||
      option.value === null ||
      option.kind === 'spread' ||
      option.kind === 'computed' ||
      option.kind === 'accessor'
    ) {
      continue
    }
    const key = option.key
    const value = option.value
    const isSplit = split.has(key)
    if (
      option.kind !== 'method' &&
      (isFallbackLiteral(value) || isAlreadyLazy(ctx, value))
    ) {
      continue
    }
    const sym = option.kind === 'method' ? null : identifierSymbol(ctx, value)
    if (sym !== null) {
      // a module binding: registrable by its own declaration when
      // capitalised; a lowercase local one is renamed module-wide, split
      // or not (React Refresh registers it wherever it is declared)
      const name = symbols.name(sym)
      const record = (registered: string) => {
        if (!isSplit) {
          round.unsplit[key] = registered
        }
      }
      if (isCapitalised(name)) {
        record(name)
        continue
      }
      if (cfg.framework !== 'react' || symbols.isImport(sym)) {
        record(name)
        continue
      }
      const renamed = ctx.nameOf(sym)
      if (renamed !== name) {
        record(renamed)
        continue
      }
      const units = ctx.t1.declaringUnits.get(sym) ?? []
      const local = units.some((u) => ctx.t1.units[u]!.kind === 'declaration')
      if (!local) {
        record(name)
        continue
      }
      const next = names.alloc(`Tsr${pascal(key)}`)
      // the occurrences that are split option values are the splitter's
      // (its edit replaces them; the chunk reads the renamed symbol)
      ctx.renameRefs(
        sym,
        { sym: next.sym },
        'all-outputs',
        ROUTER_PLANNER,
        splitRegions,
      )
      record(next.name)
      continue
    }
    if (cfg.framework !== 'react' || isSplit) {
      continue
    }
    // inline value or method: hoist into a registrable binding before the options
    const hoisted = names.alloc(`Tsr${pascal(key)}`)
    const body: Array<Frag> = []
    let region: { start: number; end: number }
    let placeholder: Array<Frag>
    if (option.kind === 'method') {
      const fn = value
      body.push({
        k: 'text',
        parts: [`const ${hoisted.name} = ${methodPrefixOf(fn)}`],
      })
      body.push({ k: 'slice', range: { start: fn.start, end: fn.end } })
      body.push({ k: 'text', parts: ['\n'] })
      region = { start: option.prop.start, end: option.prop.end }
      placeholder = [
        { k: 'text', parts: [`${option.keyText}: `, { sym: hoisted.sym }] },
      ]
    } else {
      // casts and parentheses around the value are dropped from the hoist
      // (`(() => …) as any`): React Refresh registers a bare function
      const inner = unwrapExpression(value)
      body.push({ k: 'text', parts: [`const ${hoisted.name} = `] })
      body.push({
        k: 'slice',
        range: { start: inner.start, end: inner.end },
      })
      body.push({ k: 'text', parts: ['\n'] })
      region = { start: value.start, end: value.end }
      placeholder = [{ k: 'text', parts: [{ sym: hoisted.sym }] }]
    }
    const owner = ctx.rewrites.addGenerated({
      body,
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'before-unit', unit: route.optionsUnit.id },
      home: 'auto',
      by: ROUTER_PLANNER,
    })
    ctx.rewrites.claim({
      region: ctx.region(region, 'option-value'),
      owner,
      placeholder,
      by: ROUTER_PLANNER,
    })
    round.unsplit[key] = hoisted.name
  }
}

/**
 * After the split part: the dev block of the route module and, on
 * webpack-style hosts, of its split chunks holding a non-component option.
 */
export function planHmrBlock(
  ctx: PlanContext,
  round: RouterRound,
  style: HmrStyle,
): void {
  const { cfg, route } = round
  if (route.kind === 'lazy' || route.routeId === null) {
    return
  }
  const { names } = ctx
  const hmr = names.alloc('tsrHmr')
  const vite = style === 'vite'
  const reactVite = vite && cfg.framework === 'react'
  const anchor = reactVite ? names.alloc('TsrFastRefreshAnchor') : null
  const metaParts: Array<string> = []
  const unsplitKeys = Object.keys(round.unsplit)
  if (unsplitKeys.length > 0) {
    metaParts.push(
      `unsplit: { ${unsplitKeys
        .map((k) => `${k}: ${stringLiteral(round.unsplit[k]!, '"')}`)
        .join(', ')} }`,
    )
  }
  if (anchor) {
    // every export name plugin-react may see: the module's own, the
    // anchor, and (over-approximated) every module-level binding the
    // core may export as glue for the chunks
    const exportNames = new Set<string>()
    for (const e of ctx.analysis.exports) {
      if (e.kind === 'star') {
        continue
      }
      if (e.kind === 'expression' || !e.typeOnly) {
        exportNames.add(e.name)
      }
    }
    const { symbols } = ctx.t1
    for (let i = 0; i < symbols.size; i++) {
      if (symbols.isModuleLevel(i as SymbolId)) {
        exportNames.add(symbols.name(i as SymbolId))
      }
    }
    exportNames.add(anchor.name)
    metaParts.push(
      `refreshExports: { id: ${stringLiteral(ctx.identity.canonicalId, '"')}, anchor: ${stringLiteral(anchor.name, '"')}, exports: [${[
        ...exportNames,
      ]
        .map((n) => stringLiteral(n, '"'))
        .join(', ')}] }`,
    )
  }
  const hot = vite ? 'import.meta.hot' : 'import.meta.webpackHot'
  // the dev-only runtime lives on its own subpath: production never loads it
  const hmrSpecifier = `${route.routerPackage}/hmr`
  const body: Array<Frag> = [
    {
      k: 'text',
      parts: [
        `if (${hot}) {\n  ${hot}.accept()\n  `,
        { sym: hmr.sym, ctx: 'callee' },
        `(${stringLiteral(routerRouteId(route.routeId), '"')}, `,
        { sym: route.routeSym },
        `, { ${metaParts.join(', ')} })\n}\n`,
      ],
    },
  ]
  if (anchor) {
    body.push({
      k: 'text',
      parts: [`export function ${anchor.name}() { return null }\n`],
    })
  }
  ctx.rewrites.addGenerated({
    body,
    declares: anchor ? [anchor.sym] : [],
    effectful: true,
    anchor: { k: 'end' },
    home: 'auto',
    by: ROUTER_PLANNER,
    imports: [
      {
        names: [{ imported: '__tsrRouteHmr', local: hmr.sym }],
        spec: {
          k: 'spec',
          specifier: hmrSpecifier,
          edgeKey: ctx.edgeKey(hmrSpecifier, 'static', 'runtime'),
          provenance: { origin: 'runtime' },
        },
      },
    ],
  })
  if (routeRefreshMarkers(cfg)) {
    markSplitComponents(ctx, round)
  }
  if (!vite) {
    chunkHmr(ctx, round, route.routeId)
  }
}

/**
 * React: each component a split chunk exports carries the route-HMR identity
 * marker (`$$tsrRefreshId`), compared by the runtime when the re-imported
 * chunk arrives: the same identity is kept for React Refresh to patch in
 * place, another one is swapped in.
 */
function markSplitComponents(ctx: PlanContext, round: RouterRound): void {
  for (const c of round.splitComponents) {
    if (c.valueSym !== null && ctx.symbols.isImport(c.valueSym)) {
      // a foreign module's export (an imported binding or a member of one)
      // is not this module's to mark: React Refresh registers it where it
      // is declared, and the object may be frozen
      continue
    }
    // identity = the module React Refresh registers the binding in (where
    // placement puts the user's component: this chunk or the route module,
    // nothing is extracted in dev; a move is a new family) + the binding:
    // the user's component when the value names one (a rename is a new
    // family), else the chunk's own declaration
    ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts:
            c.valueSym !== null
              ? [
                  c.exported,
                  '.$$tsrRefreshId = ',
                  { sym: c.valueSym, ctx: 'homeId' },
                  ` + ${stringLiteral(` ${ctx.nameOf(c.valueSym)}`, '"')}\n`,
                ]
              : [
                  c.exported,
                  `.$$tsrRefreshId = ${stringLiteral(`${c.output.slice('derived:'.length)} ${c.name}`, '"')}\n`,
                ],
        },
      ],
      declares: [],
      effectful: true,
      anchor: { k: 'end' },
      home: c.output,
      by: ROUTER_PLANNER,
    })
  }
}

/**
 * Webpack-style hosts: a split chunk holding a non-component option (the
 * `loader`) reports each evaluation to the route HMR runtime, so an edit of
 * that option alone reaches the page. The chunk accepts nothing itself: its
 * update bubbles to its importer. The route module (self-accepting)
 * refreshes the route when it evaluates again; Rspack's lazy-compilation
 * proxy re-resolves the chunk alone, whose evaluation then refreshes the
 * route (`applyRouteChunkHmr`). Vite re-runs the dynamic importer itself.
 * Component-only chunks are the framework refresh runtime's.
 */
function chunkHmr(ctx: PlanContext, round: RouterRound, routeId: string): void {
  const groups = new Map<string, boolean>()
  for (const d of round.plan.decisions) {
    groups.set(
      d.groupKey,
      (groups.get(d.groupKey) ?? false) || !HMR_COMPONENT_KEYS.includes(d.key),
    )
  }
  for (const [groupKey, hasNonComponent] of groups) {
    if (!hasNonComponent) {
      continue
    }
    const output = ctx.declareOutput({
      kind: 'split',
      key: groupKey,
      derived: { kind: 'split', value: groupKey },
    })
    const helper = ctx.names.alloc('tsrChunkHmr')
    const hmrSpecifier = `${round.route.routerPackage}/hmr`
    ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: [
            'if (import.meta.webpackHot) {\n  ',
            { sym: helper.sym, ctx: 'callee' },
            `(${stringLiteral(routerRouteId(routeId), '"')}, ${stringLiteral(groupKey, '"')})\n}\n`,
          ],
        },
      ],
      declares: [],
      effectful: true,
      anchor: { k: 'end' },
      home: output,
      by: ROUTER_PLANNER,
      imports: [
        {
          names: [{ imported: '__tsrRouteChunkHmr', local: helper.sym }],
          spec: {
            k: 'spec',
            specifier: hmrSpecifier,
            edgeKey: ctx.edgeKey(hmrSpecifier, 'static', 'runtime'),
            provenance: { origin: 'runtime' },
          },
        },
      ],
    })
  }
}
