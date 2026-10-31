/**
 * The `import-edges` planner (J6): phase C policy over every output's surviving
 * edges (the core extracts them per output, with provenance). Per edge:
 * importer scope → specifier rule on the raw specifier → resolution with the
 * env's resolver → `excludeFiles` → file rule → the target's marker (raw-domain
 * target facts). A violation is substituted by its edge module (the specifier
 * literal only):
 *
 * - dev: with `log: 'once'`, `onViolation` decides now, once per logical
 *   edge for the session (`false` leaves the edge alone); with `'always'`
 *   the host asks at every compile, a cached plan's included
 *   (`ImportProtectionEnv.afterCompile`; `false` makes the edge module serve
 *   the real module). `mock` substitutes the mock, `error` leaves the
 *   specifier and the host fails the module. An edge the
 *   bundler's TypeScript transform may erase (a static import of a
 *   `.ts`/`.tsx` module with no binding used as a value) is substituted in
 *   both behaviours and recorded *pending*: the host confirms it when the
 *   bundler requests its edge module from the transformed importer
 *   (`ImportProtectionEnv.confirm`), which never happens for an erased
 *   import;
 * - build: every violation gets its edge module (mock first in both
 *   behaviours); `onViolation` runs after tree-shaking (`verdict.ts`): an
 *   erased edge module is absent from the bundle.
 *
 * A module that a file rule or its own marker denies in the environment it
 * is compiled in is its own violation (`EdgeViolation.self`): each import of
 * it the plan reads is substituted, so an import the compiler does not read
 * brought it there (an `import.meta.glob`, a template literal `import()`).
 * The host serves its mock, unless an exempt importer imports it (its
 * imports are indexed, not judged) or a veto allowed it; a dev compile
 * reports it then, a build names its importers from the bundler's graph.
 * An asset query of a denied file is never compiled, and the same verdict
 * reaches it through its host (`ImportProtectionEnv.assetOutput`).
 *
 * Violations are recorded in the plan's facts (`ImportEdgesFacts`), so a
 * cached plan reports and registers them again without re-judging.
 */
import { ASSET_QUERY_RE, identify } from '@tanstack/router-utils/compiler'
import { edgeModuleKey } from '../import-protection/edge-modules'
import { Locator } from '../import-protection/locate'
import {
  fileOrMarkerRule,
  markerViolates,
  matchSpecifier,
  ownFileRule,
  relativeTargetPath,
  rulesFor,
} from '../import-protection/rules'
import { relativizePath } from '../import-protection/utils'
import {
  IMPORT_EDGES_PLANNER,
  dedupeKey,
  selfViolationOf,
  violationInfo,
} from '../import-protection/violations'
import type {
  EdgeRecord,
  EmitPlan,
  Planner,
  PolicyContext,
} from '@tanstack/router-utils/compiler'
import type { EdgeModuleContent } from '../import-protection/edge-modules'
import type { IndexedEdge } from '../import-protection/graph-trace'
import type { OriginalLocation } from '../import-protection/locate'
import type { EnvType, RuleRef } from '../import-protection/rules'
import type { ImportProtection } from '../import-protection/session'
import type {
  EdgeViolation,
  ImportEdgesFacts,
} from '../import-protection/violations'

/**
 * A host's import rewrite (`HostServices.services.importRewrite`): the
 * specifiers the bundler turns an import of `specifier` with `names` into
 * (Rsbuild `source.transformImport`), or null when it leaves it alone. The
 * specifier rule judges the raw specifier; file and marker rules judge the
 * rewritten targets.
 */
export type ImportRewrite = (
  specifier: string,
  names: ReadonlyArray<string>,
) => Array<string> | null

/** The planner's configuration of a compile (`CompileConfig.perPlanner`): its environment's type. */
export type ImportEdgesConfig = EnvType

/** Most modules an effect classification follows from one target (beyond: effectful). */
const MAX_EFFECT_WALK = 256

interface Judged {
  edge: EdgeRecord
  raw: string
  importerPath: string
  resolved: string | null
  rule: RuleRef | null
  /** Offset of the specifier in this compile's input text, when it is in that text. */
  offset: number | undefined
}

interface TargetDescription {
  names: Array<string>
  hasDefault: boolean
  effectful: boolean
}

/**
 * The module whose marker a target's is. An asset query of a file (`x.ts?raw`)
 * has no language, so no marker of its own: on a client, the file's. A server
 * gets the text or URL of a client-only file: that runs nothing of it there.
 */
function markerIdOf(envType: EnvType, target: string): string {
  return envType === 'client' &&
    ASSET_QUERY_RE.test(target) &&
    !target.startsWith('\0')
    ? identify(target).path
    : target
}

export function importEdgesPlanner(ip: ImportProtection): Planner {
  const { config } = ip
  const isAppFile = (path: string) =>
    !path.includes('/node_modules/') && !path.startsWith('\0')
  /** The module's own violation, if its file rule or its marker denies it here. */
  const ownViolation = async (ctx: PolicyContext, plan: EmitPlan) => {
    const id = ctx.identity.canonicalId
    const rule = await fileOrMarkerRule(
      config,
      ctx.env.type,
      ctx.identity.path,
      () => plan.facts.marker,
    )
    return (
      rule &&
      selfViolationOf(config, ctx.env, id, rule, await describeTarget(id, ctx))
    )
  }
  return {
    name: IMPORT_EDGES_PLANNER,
    tier: 0,
    gate(t0, ctx) {
      if (t0.markers === 'conflict') {
        return true
      }
      const path = ctx.identity.path
      // the environment's type (`ImportEdgesConfig`): a module importing
      // nothing can still be its own violation there
      const envType = ctx.config as ImportEdgesConfig | undefined
      if (
        t0.imports.length === 0 &&
        t0.reexports.length === 0 &&
        t0.dynamicEdges.length === 0 &&
        (envType === undefined || ownFileRule(config, envType, path) === null)
      ) {
        return false
      }
      return (
        ip.inScope(path) ||
        ip.exempt(path) ||
        (envType === 'client' && isAppFile(path))
      )
    },
    plan() {},
    async policy(plan, output, edges, ctx) {
      const env = ip.env(ctx.env.name, ctx.env.type)
      const facts = ((plan.facts.planners[IMPORT_EDGES_PLANNER] as
        | ImportEdgesFacts
        | undefined) ??= { violations: {} })
      if (output === 'env' && plan.facts.marker === 'conflict') {
        ctx.diagnostic({
          severity: 'error',
          message: `[import-protection] ${relativizePath(ctx.identity.path, config.root)} imports both a server-only and a client-only marker: a module can be restricted to one environment only`,
          by: IMPORT_EDGES_PLANNER,
          code: 'import-protection-marker-conflict',
        })
      }
      // an exempt importer's imports are only indexed: a denied module it
      // imports is allowed (`ImportProtectionEnv.allowsSelf`)
      const exempt = !ip.inScope(ctx.identity.path)
      // the scope is about importers: on a client an app file outside it is
      // indexed like an exempt importer, and judged itself as a denied file
      const judgedOwn =
        exempt && ctx.env.type === 'client' && isAppFile(ctx.identity.path)
      if (exempt && !judgedOwn && !ip.exempt(ctx.identity.path)) {
        return
      }
      const envType = ctx.env.type
      const rules = rulesFor(config, envType)
      const recipe = plan.outputs[output]
      const importerId = recipe?.derivedId ?? ctx.identity.canonicalId
      const locator = new Locator(ctx.code, ctx.identity.path, ctx.inputMap)
      const typescript =
        ctx.identity.lang === 'ts' || ctx.identity.lang === 'tsx'

      const rewriter = (
        ctx.host.services as
          | { importRewrite?: ImportRewrite | undefined }
          | undefined
      )?.importRewrite
      const judge = async (e: EdgeRecord): Promise<Judged | null> => {
        if (e.provenance.origin === 'runtime' || e.typeOnly) {
          return null
        }
        const forwarded =
          e.provenance.origin === 'forwarded' ? e.provenance : null
        const raw = forwarded ? forwarded.rawSpecifier : e.specifier
        const from = forwarded ? forwarded.importerId : e.importerId
        const importerPath = identify(from).path
        if (forwarded && !ip.inScope(importerPath)) {
          return null
        }
        let rule = matchSpecifier(rules, raw)
        // an entry's own marker denies it here (a server-only-marked client
        // entry): its marker import is the violating edge, located at the
        // marker. A marked non-entry module is judged through its importers
        // (an exempt importer gets it, J6.7).
        const ownMarker = ip.markerSpecifiers[raw]
        if (
          rule === null &&
          ownMarker !== undefined &&
          markerViolates(envType, ownMarker) &&
          ip.isEntry(importerPath)
        ) {
          rule = { type: 'marker' }
        }
        let resolved = await ctx.resolve(raw, from)
        if (rule === null && !exempt) {
          // a bundler rewrite of the import (Rsbuild `source.transformImport`)
          // makes the file and marker rules judge the rewritten targets
          const rewritten = rewriter?.(raw, e.names) ?? null
          for (const spec of rewritten ?? [raw]) {
            const target =
              spec === raw ? resolved : await ctx.resolve(spec, from)
            if (target === null) {
              continue
            }
            // the marker only: an edit of the target's imports or exports does not re-plan its importers
            const targetRule = await fileOrMarkerRule(
              config,
              envType,
              target,
              () => ctx.targetMarker(markerIdOf(envType, target)),
            )
            if (targetRule !== null) {
              rule = targetRule
              resolved = target
              break
            }
          }
        }
        let offset: number | undefined
        if (forwarded) {
          if (importerPath === ctx.identity.path) {
            offset = forwarded.span.start
          }
        } else {
          offset = e.locations.find(
            (l): l is { range: { start: number; end: number } } => 'range' in l,
          )?.range.start
        }
        return { edge: e, raw, importerPath, resolved, rule, offset }
      }

      const judged = (await Promise.all(edges.map(judge))).filter(
        (j): j is Judged => j !== null,
      )
      env.edges.set(
        importerId,
        judged
          .filter((j) => j.resolved !== null)
          .map(
            (j): IndexedEdge => ({
              resolved: j.resolved!,
              specifier: j.raw,
              ...(j.offset !== undefined && { offset: j.offset }),
            }),
          ),
        plan.revision,
      )
      if (judgedOwn && output === 'env' && !ip.isEntry(ctx.identity.path)) {
        const own = await ownViolation(ctx, plan)
        if (own) {
          facts.violations[output] = [own]
        }
      }
      if (exempt) {
        return
      }

      const violations: Array<EdgeViolation> = []
      for (const j of judged) {
        if (j.rule === null) {
          continue
        }
        // located now, through the input map (only a violation is located:
        // the map is the bundler's to combine, and only while the hook runs)
        const loc: OriginalLocation | null =
          j.offset === undefined ? null : locator.at(j.offset)
        const behavior = config.behavior
        // TypeScript may erase a static import whose bindings are unused or
        // only used as types (per the bundler's transform options): the host
        // decides when the bundler asks for the edge module
        const pending =
          config.mode === 'dev' &&
          typescript &&
          j.edge.form === 'static' &&
          j.edge.kind === 'evaluation'
        const substitute =
          config.mode === 'build' || behavior === 'mock' || pending
        const base: EdgeViolation = {
          edgeKey: j.edge.edgeKey,
          env: ctx.env.name,
          envType,
          rule: j.rule,
          specifier: j.raw,
          importer: j.importerPath,
          importerId,
          resolved: j.resolved,
          loc,
          snippet: loc && locator.frame(loc),
          behavior,
          module: null,
          ...(pending && { pending: true }),
        }
        if (config.mode === 'dev' && !pending && config.log === 'once') {
          const verdict = await env.onceVerdict(dedupeKey(base), async () =>
            config.onViolation?.(
              violationInfo(base, config, () => env.trace(importerId)),
            ),
          )
          if (verdict === false) {
            env.allowTarget(j.resolved)
            continue
          }
        }
        if (substitute) {
          const content = await edgeModuleContent(plan, j, ctx)
          const key = edgeModuleKey(content)
          base.module = { key, content }
          ctx.substitute(j.edge.edgeKey, ip.ids.request(key, content))
        }
        violations.push(base)
      }
      // the module's own violation (an entry's own marker is judged at its
      // marker import above)
      if (output === 'env' && !ip.isEntry(ctx.identity.path)) {
        const own = await ownViolation(ctx, plan)
        if (own) {
          violations.push(own)
        }
      }
      if (violations.length > 0) {
        facts.violations[output] = violations
      } else {
        delete facts.violations[output]
      }
    },
  }

  /** The edge module of a violation: names, effect witness and allowed form. */
  async function edgeModuleContent(
    plan: EmitPlan,
    j: Judged,
    ctx: PolicyContext,
  ): Promise<EdgeModuleContent> {
    // the module's own marker: the marker module is empty, but the edge must
    // survive with the module (its witness tells whether the marked module is
    // in the bundle), so the mock keeps the effect witness
    const ownMarker = ip.markerSpecifiers[j.raw] !== undefined
    const target =
      j.resolved !== null && !ownMarker
        ? await describeTarget(j.resolved, ctx)
        : null
    const names = new Set<string>(target?.names ?? [])
    // every name any output of this plan reads through the same logical edge
    for (const list of Object.values(plan.edges)) {
      for (const e of list) {
        if (e.edgeKey === j.edge.edgeKey) {
          for (const n of e.names) {
            names.add(n)
          }
        }
      }
    }
    const importsDefault = names.has('default')
    names.delete('default')
    names.delete('*')
    return {
      env: ctx.env.name,
      edgeKey: j.edge.edgeKey,
      specifier: j.raw,
      importer: relativizePath(j.importerPath, config.root),
      file:
        j.rule?.type !== 'specifier' && j.resolved !== null && !ownMarker
          ? relativeTargetPath(config, j.resolved)
          : null,
      names: [...names].sort(),
      effectful: ownMarker || (target?.effectful ?? true),
      resolved: j.resolved,
      hasDefault: importsDefault || (target?.hasDefault ?? true),
      bare: j.edge.form === 'bare',
    }
  }

  /**
   * What a mock of `resolved` must export (its export names, following
   * `export *`) and whether evaluating it has effects (own top-level
   * effects, an effectful module it evaluates, a package without
   * `sideEffects: false`; unknown → effectful). Every consulted module is a
   * target-facts/resolution fingerprint of this plan (J6.13).
   */
  async function describeTarget(
    resolved: string,
    ctx: PolicyContext,
  ): Promise<TargetDescription> {
    const p = identify(resolved).path
    // a text or URL: importing it evaluates nothing of the file
    if (/\.json$/i.test(p) || ASSET_QUERY_RE.test(resolved)) {
      return { names: [], hasDefault: true, effectful: false }
    }
    const names = new Set<string>()
    const top = await ctx.targetFacts(resolved)
    const visitedStars = new Set<string>()
    const collect = async (id: string, isTop: boolean): Promise<void> => {
      if (visitedStars.has(id) || visitedStars.size > MAX_EFFECT_WALK) {
        return
      }
      visitedStars.add(id)
      const facts = isTop ? top : await ctx.targetFacts(id)
      for (const n of facts.exportNames) {
        if (!isTop && n === 'default') {
          continue
        }
        names.add(n)
      }
      for (const star of facts.stars) {
        const r = await ctx.resolve(star, id)
        if (r !== null) {
          await collect(r, false)
        }
      }
    }
    await collect(resolved, true)
    const visited = new Set<string>()
    const effectful = async (id: string): Promise<boolean> => {
      if (visited.has(id)) {
        return false
      }
      visited.add(id)
      if (visited.size > MAX_EFFECT_WALK) {
        return true
      }
      const path = identify(id).path
      if (path.includes('/node_modules/')) {
        return !(await ip.packageSideEffectFree(path))
      }
      const facts = id === resolved ? top : await ctx.targetFacts(id)
      if (!facts.exists || !facts.esm || facts.codeEffects) {
        return true
      }
      for (const spec of facts.imports) {
        const r = await ctx.resolve(spec, id)
        if (r === null || (await effectful(r))) {
          return true
        }
      }
      return false
    }
    return {
      names: [...names].filter((n) => n !== 'default'),
      hasDefault: top.exportNames.includes('default') || !top.esm,
      effectful: await effectful(resolved),
    }
  }
}
