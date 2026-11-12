/**
 * The route HMR part of the router planner (SPEC J3; the runtime side is
 * `hmr.ts` of router-core and the framework routers), in a development
 * client only.
 *
 * Before the split part (`planHmrHoists`): for React, every component option
 * that stays in the route module and that React Refresh can register
 * becomes a registrable binding — inline functions and higher-order calls
 * are hoisted into `const Tsr<Key> = …` before the statement holding the
 * options (a claim, so the original body is relocated, not reprinted),
 * lowercase module-level components are renamed module-wide (the runtime
 * takes the new component after React Refresh's pass; a family is what
 * keeps its state). For Solid and Vue, it records the refresh identity of
 * each such option (`unsplit`: a binding's name, an import's module and
 * export); any other value (a conditional, a member) has none: an edit
 * swaps it.
 * A lazy route file (`createLazyFileRoute`, never split) gets both; its
 * options are the ones the route loads with its chunk (`lazy: true` in the
 * block's meta).
 * After it (`planHmrBlock`): the dev block, with the literal
 * `import.meta.hot.accept(` (Vite) / `import.meta.webpackHot.accept()`, the
 * `__tsrRouteHmr(routeId, Route, meta)` call that runs on every evaluation,
 * and, for React on Vite, the refresh anchor export; on webpack-style hosts,
 * the chunk blocks (`chunkHmr`, `keptReaderHmr`).
 */
import {
  stringLiteral,
  unwrapExpression,
} from '@tanstack/router-utils/compiler'
import {
  bindingIdentity,
  identifierSymbol,
  isAlreadyLazy,
  isFallbackLiteral,
  pascal,
  refreshRegisters,
  routerRouteId,
} from './route'
import { COMPONENT_KEYS, methodPrefixOf } from './decisions'
import { ROUTER_PLANNER } from './config'
import type { HmrStyle } from './config'
import type { RouterRound } from './router'
import type {
  GenFrag,
  PlanContext,
  SymRef,
  SymbolId,
} from '@tanstack/router-utils/compiler'

/** The component options route HMR keeps: the splittable ones and `shellComponent`. */
const HMR_COMPONENT_KEYS: ReadonlyArray<string> = [
  ...COMPONENT_KEYS,
  'shellComponent',
]

function isCapitalised(name: string): boolean {
  const c = name.charCodeAt(0)
  return c >= 65 && c <= 90
}

/**
 * Before the split part: React, makes every component option that stays in
 * the route module a binding React Refresh registers where it can; Solid
 * and Vue, records its refresh identity (`round.unsplit`).
 */
export function planHmrHoists(ctx: PlanContext, round: RouterRound): void {
  const { cfg, route, plan } = round
  if (route.options.kind !== 'object') {
    return
  }
  const split = new Set(plan.decisions.map((d) => d.key))
  // a deleted option is no component of the route (its removal may span the
  // region a hoist would claim)
  const deleted = new Set(plan.deleted.map((d) => d.key))
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
      deleted.has(option.key) ||
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
      (isFallbackLiteral(value) ||
        isAlreadyLazy(ctx, round.route.routerPackage, value))
    ) {
      continue
    }
    const sym = option.kind === 'method' ? null : identifierSymbol(ctx, value)
    if (sym !== null) {
      if (cfg.framework !== 'react') {
        if (!isSplit) {
          round.unsplit[key] = bindingIdentity(ctx, sym)
        }
        continue
      }
      // a module binding: registrable by its own declaration when
      // capitalised; a lowercase local one is renamed module-wide, split
      // or not (React Refresh registers it wherever it is declared); an
      // import is registered by its module, under its export's name
      const name = symbols.name(sym)
      if (
        isCapitalised(name) ||
        symbols.isImport(sym) ||
        ctx.nameOf(sym) !== name
      ) {
        continue
      }
      const units = ctx.t1.declaringUnits.get(sym) ?? []
      const local = units.some((u) => ctx.t1.units[u]!.kind === 'declaration')
      if (!local) {
        continue
      }
      const next = names.alloc(`Tsr${pascal(key)}`)
      // the occurrences that are split option values are the splitter's
      // (its edit replaces them; the chunk reads the renamed symbol)
      ctx.renameRefs(sym, { sym: next.sym }, ROUTER_PLANNER, splitRegions)
      continue
    }
    if (
      cfg.framework !== 'react' ||
      isSplit ||
      (option.kind !== 'method' && !refreshRegisters(value))
    ) {
      // (a value React Refresh registers no family for stays inline: an
      // edit remounts it)
      continue
    }
    // inline value or method: hoist into a registrable binding before the options
    const hoisted = names.alloc(`Tsr${pascal(key)}`)
    // the hoist claims the bare value (React Refresh registers a bare
    // function) and renders it whole: a cast around it stays in place,
    // around the placeholder (`TsrComponent as any`), and so does a method's
    // key, which the property's edit writes before the placeholder
    const method = option.kind === 'method'
    const inner = method ? value : unwrapExpression(value)
    const range = { start: inner.start, end: inner.end }
    const region = ctx.region(range, 'option-value')
    const owner = ctx.rewrites.addGenerated({
      body: [
        {
          k: 'text',
          parts: [
            `const ${hoisted.name} = ${method ? methodPrefixOf(value) : ''}`,
          ],
        },
        { k: 'region', id: region },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'before-unit', unit: route.optionsUnit.id },
      home: 'auto',
      by: ROUTER_PLANNER,
    })
    if (method) {
      ctx.rewrites.edit({
        range: { start: option.prop.start, end: option.prop.end },
        body: [
          { k: 'text', parts: [`${option.keyText}: `] },
          { k: 'slice', range },
        ],
        by: ROUTER_PLANNER,
      })
    }
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      by: ROUTER_PLANNER,
    })
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
  // options the compiler can't read may be one object shared across
  // evaluations, which the route adopts: a second evaluation can't take it, so
  // an edit reloads the page (J2.8)
  if (route.options.kind === 'opaque') {
    return
  }
  const { names } = ctx
  const hmr = names.alloc('tsrHmr')
  const vite = style === 'vite'
  const reactVite = vite && cfg.framework === 'react'
  const anchor = reactVite ? names.alloc('TsrFastRefreshAnchor') : null
  // a lazy route file's `Route` holds the options the route loads with its
  // chunk: the runtime applies them to the route of its id
  const metaParts: Array<string> = route.kind === 'lazy' ? ['lazy: true'] : []
  const unsplitKeys = Object.keys(round.unsplit)
  if (unsplitKeys.length > 0) {
    metaParts.push(
      `unsplit: { ${unsplitKeys
        .map((k) => `${k}: ${stringLiteral(round.unsplit[k]!, '"')}`)
        .join(', ')} }`,
    )
  }
  const hot = vite ? 'import.meta.hot' : 'import.meta.webpackHot'
  // the dev-only runtime lives on its own subpath: production never loads it
  const hmrSpecifier = `${route.routerPackage}/hmr`
  const call: Array<string | SymRef> = [
    `if (${hot}) {\n  ${hot}.accept()\n  `,
    { sym: hmr.sym, ctx: 'callee' },
    `(${stringLiteral(routerRouteId(route.routeId), '"')}, `,
    { sym: route.routeSym },
    `, { ${metaParts.join(', ')}`,
  ]
  const body: Array<GenFrag> = []
  if (anchor) {
    // the exports plugin-react ignores: the route, the anchor and
    // (over-approximated) every module-level binding the core may export as
    // glue for the chunks, by its name and by its glue name (`x$1` when `x`
    // is an export's name, `tsr$x` next to `export *`), but no other export
    // of the user's: plugin-react validates those, so a component updates in
    // place and an edited value invalidates the module for its importers (a
    // reload, as on main)
    const exportNames = new Set<string>()
    const userExports = new Set<string>()
    let star = false
    for (const e of ctx.analysis.exports) {
      if (e.kind === 'star') {
        star ||= !e.typeOnly
        continue
      }
      if (e.kind === 'local' && e.local === route.routeSym) {
        exportNames.add(e.name)
      } else if (e.kind !== 'local' || !e.typeOnly) {
        userExports.add(e.name)
      }
    }
    const { symbols } = ctx.t1
    for (let i = 0; i < symbols.size; i++) {
      const sym = i as SymbolId
      if (!symbols.isModuleLevel(sym)) {
        continue
      }
      const name = symbols.name(sym)
      if (!userExports.has(name)) {
        exportNames.add(name)
      }
      // a glue name is another name (free of the module's exports) only
      // next to `export *` or when an export takes the binding's name
      if (
        sym !== route.routeSym &&
        (star || !ctx.names.isExportNameFree(name))
      ) {
        exportNames.add(ctx.glueExportName(sym))
      }
    }
    exportNames.add(anchor.name)
    call.push(
      `${metaParts.length > 0 ? ', ' : ''}refreshExports: { id: ${stringLiteral(ctx.identity.canonicalId, '"')}, anchor: ${stringLiteral(anchor.name, '"')}, exports: [${[...exportNames].map((n) => stringLiteral(n, '"')).join(', ')}`,
    )
    body.push({
      k: 'text',
      parts: [
        ...call,
        `] } })\n}\nexport function ${anchor.name}() { return null }\n`,
      ],
    })
  } else {
    body.push({ k: 'text', parts: [...call, ' })\n}\n'] })
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
  if (!vite) {
    chunkHmr(ctx, round, route.routeId)
    keptReaderHmr(ctx, round, route.routeId)
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

/**
 * Webpack-style hosts: every derived module of the file that imports a
 * binding the route module keeps, other than the route (placement decides
 * which: `env-readers`), hands its hot handle to the route HMR runtime. The
 * route module self-accepts, so an update of it reaches no such module (its
 * text did not change) and the module would go on reading the bindings of
 * the route module's earlier evaluation: the route module's next evaluation
 * invalidates them and refreshes the route once the update is applied
 * (`applyRouteHmr`). Vite's update holds every module of the edited file.
 */
function keptReaderHmr(
  ctx: PlanContext,
  round: RouterRound,
  routeId: string,
): void {
  const helper = ctx.names.alloc('tsrKeptReaderHmr')
  const hmrSpecifier = `${round.route.routerPackage}/hmr`
  ctx.rewrites.addGenerated({
    body: [
      {
        k: 'text',
        parts: [
          'if (import.meta.webpackHot) {\n  ',
          { sym: helper.sym, ctx: 'callee' },
          `(${stringLiteral(routerRouteId(routeId), '"')}, import.meta.webpackHot)\n}\n`,
        ],
      },
    ],
    declares: [],
    effectful: true,
    anchor: { k: 'end' },
    home: { k: 'env-readers', besides: [round.route.routeSym] },
    by: ROUTER_PLANNER,
    imports: [
      {
        names: [{ imported: '__tsrKeptReaderHmr', local: helper.sym }],
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
