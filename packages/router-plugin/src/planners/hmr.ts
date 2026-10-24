/**
 * `route-hmr` planner (J3; DESIGN §3.15.1, impl-notes-runtime §1).
 *
 * `prepare` (React only, before `route-split`): every component option that
 * stays in the route module becomes a registrable binding — inline values
 * are hoisted into `const Tsr<Key> = …` before the statement holding the
 * options (a claim, so the original body is relocated, not reprinted),
 * lowercase module-level components are renamed module-wide. `plan`
 * (after `route-split`) appends the dev block: the literal
 * `import.meta.hot.accept(` (Vite) / `import.meta.webpackHot.accept()`, the
 * `__tsrRouteHmr(routeId, Route, meta)` call that runs on every evaluation,
 * and, for React on Vite, the refresh anchor export. Production output
 * never sees this planner (the host registers it for dev client envs only).
 */
import { stringLiteral } from '@tanstack/router-utils/compiler'
import {
  identifierSymbol,
  isAlreadyLazy,
  isFallbackLiteral,
  pascal,
  recognizeRoute,
  routerRouteId,
  unwrapTs,
} from './route'
import { splitPlanOf } from './decisions'
import { prefetchRouteEntry, routeGate } from './split'
import { roundOf } from './round'
import type { RouterPlannerConfig } from './config'
import type { Frag, Planner } from '@tanstack/router-utils/compiler'

export const HMR_COMPONENT_KEYS: ReadonlyArray<string> = [
  'component',
  'shellComponent',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

function configOf(ctx: { config: unknown }): RouterPlannerConfig {
  return ctx.config as RouterPlannerConfig
}

function isCapitalised(name: string): boolean {
  const c = name.charCodeAt(0)
  return c >= 65 && c <= 90
}

export function routeHmrPlanner(): Planner {
  return {
    name: 'route-hmr',
    tier: 1,
    gate: (t0, ctx) => {
      const cfg = configOf(ctx)
      if (
        !cfg.hmr.enabled ||
        ctx.env.mode !== 'dev' ||
        ctx.env.type !== 'client'
      ) {
        return false
      }
      return routeGate(t0, ctx)
    },
    prefetch: prefetchRouteEntry,
    prepare(ctx) {
      const cfg = configOf(ctx)
      const r = recognizeRoute(ctx)
      if (
        !r.route ||
        r.route.kind === 'lazy' ||
        r.route.options.kind !== 'object'
      ) {
        return
      }
      const route = r.route
      const plan = splitPlanOf(ctx, cfg)
      const split = new Set(plan?.decisions.map((d) => d.key) ?? [])
      const round = roundOf(ctx)
      const { names, symbols } = ctx
      const code = ctx.analysis.source.code
      for (const option of route.props) {
        if (
          option.key === null ||
          !HMR_COMPONENT_KEYS.includes(option.key) ||
          option.value === null ||
          split.has(option.key) ||
          option.kind === 'spread' ||
          option.kind === 'computed' ||
          option.kind === 'accessor'
        ) {
          continue
        }
        const key = option.key
        const value = option.value
        if (
          option.kind !== 'method' &&
          (isFallbackLiteral(value) || isAlreadyLazy(ctx, value))
        ) {
          continue
        }
        const sym =
          option.kind === 'method' ? null : identifierSymbol(ctx, value)
        if (sym !== null) {
          const name = symbols.name(sym)
          if (isCapitalised(name)) {
            round.unsplit[key] = name
            continue
          }
          if (cfg.framework !== 'react' || symbols.isImport(sym)) {
            round.unsplit[key] = name
            continue
          }
          const already = round.renamed.get(sym)
          if (already !== undefined) {
            round.unsplit[key] = symbols.name(already)
            continue
          }
          const units = ctx.t1.declaringUnits.get(sym) ?? []
          const local = units.some(
            (u) => ctx.t1.units[u]!.kind === 'declaration',
          )
          if (!local) {
            round.unsplit[key] = name
            continue
          }
          const next = names.alloc(`Tsr${pascal(key)}`)
          ctx.renameRefs(sym, { sym: next.sym }, 'all-outputs', 'route-hmr')
          round.renamed.set(sym, next.sym)
          round.unsplit[key] = next.name
          continue
        }
        if (cfg.framework !== 'react') {
          continue
        }
        // inline value or method: hoist into a registrable binding before the options
        const hoisted = names.alloc(`Tsr${pascal(key)}`)
        const body: Array<Frag> = []
        let region: { start: number; end: number }
        let placeholder: Array<Frag>
        if (option.kind === 'method') {
          const fn = value
          const prefix =
            fn.type === 'FunctionExpression'
              ? `${fn.async ? 'async ' : ''}function${fn.generator ? '*' : ''} `
              : ''
          body.push({ k: 'text', parts: [`const ${hoisted.name} = ${prefix}`] })
          body.push({ k: 'slice', range: { start: fn.start, end: fn.end } })
          body.push({ k: 'text', parts: ['\n'] })
          region = { start: option.prop.start, end: option.prop.end }
          placeholder = [
            { k: 'text', parts: [`${option.keyText}: `, { sym: hoisted.sym }] },
          ]
        } else {
          body.push({ k: 'text', parts: [`const ${hoisted.name} = `] })
          body.push({
            k: 'slice',
            range: { start: value.start, end: value.end },
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
          by: 'route-hmr',
        })
        ctx.rewrites.claim({
          region: ctx.region(region, 'option-value'),
          owner,
          placeholder,
          by: 'route-hmr',
        })
        round.unsplit[key] = hoisted.name
        void code
        void unwrapTs
      }
    },
    plan(ctx) {
      const cfg = configOf(ctx)
      const r = recognizeRoute(ctx)
      if (!r.route || r.route.kind === 'lazy') {
        return
      }
      const route = r.route
      if (route.routeId === null) {
        return
      }
      const round = roundOf(ctx)
      const { names } = ctx
      const hmr = names.alloc('tsrHmr')
      const vite = cfg.hmr.style === 'vite'
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
      if (reactVite && anchor) {
        // every export name plugin-react may see: the module's own, the
        // anchor, and (over-approximated) every module binding the core may
        // export as glue for the chunks
        const exportNames = new Set<string>()
        for (const e of ctx.analysis.exports) {
          if (e.kind === 'star') {
            continue
          }
          if (e.kind === 'expression' || !e.typeOnly) {
            exportNames.add(e.name)
          }
        }
        for (const s of ctx.t1.symbols.names()) {
          exportNames.add(s)
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
        by: 'route-hmr',
        imports: [
          {
            names: [{ imported: '__tsrRouteHmr', local: hmr.sym }],
            spec: {
              k: 'spec',
              specifier: route.routerPackage,
              edgeKey: ctx.edgeKey(route.routerPackage, 'static', 'runtime'),
              provenance: { origin: 'runtime' },
            },
          },
        ],
      })
      ctx.setFacts('route-hmr', {
        routeId: routerRouteId(route.routeId),
        unsplit: round.unsplit,
        style: cfg.hmr.style,
      })
    },
  }
}
