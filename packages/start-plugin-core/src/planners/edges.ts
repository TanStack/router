/**
 * The `import-edges` planner (J6): phase C policy over every output's surviving
 * edges (the core extracts them per output, with provenance). Per edge:
 * importer scope → specifier rule on the raw specifier → resolution with the
 * env's resolver → `excludeFiles` → file rule → the target's marker (raw-domain
 * target facts). A violation is substituted by its edge module (the specifier
 * literal only):
 *
 * - dev: every violation gets its edge module, in both behaviours, and the
 *   host decides after the compile (`ImportProtectionEnv.judge`:
 *   `allowImport`, then the mock and its report, or for `error` the failure
 *   of the importer). An edge the bundler's TypeScript transform may erase
 *   (a static import of a `.ts`/`.tsx` module with no binding used as a
 *   value) is recorded *pending*: the host confirms it when the bundler
 *   requests its edge module from the transformed importer
 *   (`ImportProtectionEnv.confirm`), which never happens for an erased
 *   import;
 * - build: every violation gets its edge module, in both behaviours; what
 *   survives tree-shaking is reported (`ImportProtectionEnv.surviving`): an
 *   erased edge module is absent from the bundle.
 *
 * The plan holds no answer of `allowImport`: the edge module's state does
 * (the mock or a transparent re-export), so no cache keeps one.
 *
 * A module that a file rule or its own marker denies in the environment it
 * is compiled in is its own violation (`EdgeViolation.self`): each import of
 * it the plan reads is substituted, so an import the compiler does not read
 * brought it there (an `import.meta.glob`, a template literal `import()`).
 * The host serves its mock, unless an exempt importer imports it (its
 * imports are indexed, not judged) or `allowImport` allows it; a dev compile
 * reports it then, a build names its importers from the bundler's graph.
 * An asset query of a denied file is never compiled, and the same verdict
 * reaches it through its host (`ImportProtectionEnv.assetOutput`).
 *
 * Where server components render (`ImportEdgesConfig.clientReferences`), a
 * `'use client'` module is client references: its `env` output's edges are
 * neither resolved nor judged (it is judged where it runs), and the facts
 * say so. An import of it that a file or marker rule denies is recorded,
 * not substituted (`EdgeViolation.handoff`): the bundler brings the file
 * to the environment that renders client references on the server
 * through it, so it is asked about and reported like any import.
 *
 * Violations are recorded in the plan's facts (`ImportEdgesFacts`), so a
 * cached plan reports and registers them again without re-judging.
 */
import {
  identify,
  isAssetId,
  isExpressionWrapper,
  ownEntry,
} from '@tanstack/router-utils/compiler'
import { originalPositions } from '../compiler/reprinted'
import { NODE_MODULES_RE } from '../compiler/scope'
import { edgeModuleKey } from '../import-protection/edge-modules'
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
  selfViolationOf,
} from '../import-protection/violations'
import type {
  EdgeRecord,
  EmitPlan,
  ModuleAnalysis,
  PlanEdges,
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
  RenderedUse,
} from '../import-protection/violations'

/**
 * A host's import rewrite (`PlannerServices.importRewrite`): the
 * specifiers the bundler turns an import of `specifier` with `names` into
 * (Rsbuild: `source.transformImport`, a request's inline loaders), or null
 * when it leaves it alone. The rules judge the raw specifier, then the
 * rewritten ones and their targets.
 */
export type ImportRewrite = (
  specifier: string,
  names: ReadonlyArray<string>,
) => Array<string> | null

/**
 * The planner's configuration of a compile (`CompileConfig.perPlanner`):
 * its environment's type, and whether the compile renders server components
 * (RSC: Vite's `rsc` environment, Rsbuild's RSC layer). There the bundler
 * replaces a `'use client'` module by client references: none of its code
 * runs there, and an import of it brings nothing of it.
 */
export interface ImportEdgesConfig {
  type: EnvType
  clientReferences: boolean
}

interface Judged {
  edge: EdgeRecord
  raw: string
  importerPath: string
  resolved: string | null
  rule: RuleRef | null
  /** Offset of the specifier in this compile's input text, when it is in that text. */
  offset: number | undefined
  /** A denied client reference (`EdgeViolation.handoff`). */
  handoff: boolean
}

interface TargetDescription {
  names: Array<string>
  hasDefault: boolean
}

/**
 * The module whose marker a target's is. An asset of a file (`x.ts?raw`)
 * has no language, so no marker of its own: on a client, the file's. A server
 * gets the text or URL of a client-only file: that runs nothing of it there.
 */
function markerIdOf(envType: EnvType, target: string): string {
  return envType === 'client' && isAssetId(target) && !target.startsWith('\0')
    ? identify(target).path
    : target
}

/** Route options whose value the router renders as a component. */
const COMPONENT_OPTIONS = new Set([
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
  'shellComponent',
])

/** A part of an output's recipe (a kept slice of the input, or text). */
type Segment = EmitPlan['outputs'][string]['segments'][number]

interface RenderedAt {
  name: string
  via: RenderedUse['via']
  key?: string
  alias?: string
  start: number
}

/** A member chain of identifiers that names a component as a JSX tag (`Chart`, `UI.Chart`; not `chart`). */
const COMPONENT_TAG =
  /^(?:[A-Z_$][\w$]*|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)$/

type NodeLike = { type: string; start: number; end: number } & Record<
  string,
  unknown
>

/**
 * How the module renders a binding of the imports whose specifiers start at
 * `offsets` (one logical edge, possibly several statements), outside the
 * `<ClientOnly>` elements (the server erases their children) and in the
 * source the output keeps (`segments`: its recipe; the server output drops
 * the body of `createClientOnlyFn`, a `.client()` branch, …): its first use
 * as a JSX element (`<Widget />`, `<UI.Chart />`), else as a route's
 * component option (`component: Widget`, `component: UI.Chart`). Null when
 * no use is kept as written (a generated or rewritten one): the report then
 * gives the plain suggestions. A route's split output (`splitKeys`: the
 * options it holds) renders the options it holds through generated code
 * (`const TsrSplitComponent = Chart`): their uses are its own. A query of
 * the bindings' references, read only for a violation (a reference's node
 * is built when read).
 */
function renderedUse(
  analysis: ModuleAnalysis,
  code: string,
  offsets: ReadonlyArray<number>,
  segments: ReadonlyArray<Segment> | undefined,
  splitKeys: ReadonlySet<string> | null,
): RenderedAt | null {
  const { file } = analysis
  const parentOf = (n: NodeLike) =>
    file.parentOf(n as never) as unknown as NodeLike | null
  // the names the module imports the router's <ClientOnly> under
  const clientOnly = new Set(
    analysis.imports.flatMap((i) =>
      i.specifiers
        .filter((spec) => spec.imported === 'ClientOnly')
        .map((spec) => spec.localName),
    ),
  )
  const insideClientOnly = (n: NodeLike) => {
    for (let p = parentOf(n); clientOnly.size > 0 && p; p = parentOf(p)) {
      const opening =
        p.type === 'JSXElement' ? (p.openingElement as NodeLike) : null
      const name = opening?.name as NodeLike | undefined
      if (name && clientOnly.has(code.slice(name.start, name.end))) {
        return true
      }
    }
    return false
  }
  const kept = (n: NodeLike) =>
    !segments ||
    segments.some(
      (seg) => seg.k === 'slice' && seg.start <= n.start && n.end <= seg.end,
    )
  let jsx: RenderedAt | null = null
  let option: RenderedAt | null = null
  for (const imp of analysis.imports) {
    if (imp.typeOnly || !offsets.includes(imp.specifierRange.start)) {
      continue
    }
    for (const spec of imp.specifiers) {
      const binding =
        spec.typeOnly || (spec.local as number) < 0
          ? undefined
          : file.bindings[spec.local]
      for (const ref of binding?.references ?? []) {
        if (ref.inTypePosition || ref.isWrite) {
          continue
        }
        const node = ref.node as unknown as NodeLike
        if ((jsx && jsx.start < node.start) || insideClientOnly(node)) {
          continue
        }
        const asWritten = kept(node)
        if (!asWritten && !splitKeys) {
          continue
        }
        // the whole tag or value, as written: `UI.Chart` of `<UI.Chart />`,
        // `UI?.Chart` or `Screens['chart']` of an option (no JSX tag: the
        // report binds it to `alias` first)
        let outer = node
        let parent = parentOf(node)
        while (
          parent &&
          (parent.type === 'JSXMemberExpression' ||
            parent.type === 'MemberExpression') &&
          parent.object === outer
        ) {
          outer = parent
          parent = parentOf(parent)
        }
        const name = code.slice(outer.start, outer.end)
        if (node.type === 'JSXIdentifier') {
          if (asWritten) {
            jsx = { name, via: 'jsx', start: node.start }
          }
          continue
        }
        if (jsx || (option && option.start < node.start)) {
          continue
        }
        // through what passes the value on unchanged (`Chart as any`,
        // `Chart<Props>`, the optional chain of `UI?.Chart`)
        while (parent && isExpressionWrapper(parent as never)) {
          outer = parent
          parent = parentOf(parent)
        }
        const key = parent?.key as NodeLike | undefined
        if (
          parent?.type === 'Property' &&
          parent.value === outer &&
          !parent.computed &&
          key?.type === 'Identifier' &&
          COMPONENT_OPTIONS.has(key.name as string) &&
          (asWritten || splitKeys!.has(key.name as string))
        ) {
          option = {
            name,
            via: 'option',
            key: key.name as string,
            ...(!COMPONENT_TAG.test(name) && {
              alias: freeName(analysis, pascalCase(key.name as string)),
            }),
            start: node.start,
          }
        }
      }
    }
  }
  return jsx ?? option
}

const pascalCase = (key: string) => key.charAt(0).toUpperCase() + key.slice(1)

/** `name`, or `name` and a number, that no module-level binding of the module has. */
function freeName(analysis: ModuleAnalysis, name: string): string {
  const scope = analysis.file.rootScope
  let free = name
  for (let n = 2; scope.find(free); n++) {
    free = `${name}${n}`
  }
  return free
}

declare module '@tanstack/router-utils/compiler' {
  interface PlannerData {
    /** The import-edges planner's `PlannerData` (`IMPORT_EDGES_PLANNER`): facts written by its policy. */
    'import-edges': {
      config: ImportEdgesConfig | undefined
      facts: ImportEdgesFacts
    }
  }
  interface PlannerServices {
    /** Rsbuild's `source.transformImport`, as the host applies it. */
    importRewrite?: ImportRewrite | undefined
  }
}

export function importEdgesPlanner(
  ip: ImportProtection,
): Planner<typeof IMPORT_EDGES_PLANNER> {
  const { config } = ip
  /** A module of no package and not virtual. */
  const isSourceModule = (path: string) =>
    !NODE_MODULES_RE.test(path) && !path.startsWith('\0')
  /** A `'use client'` directive in the module's parsed prologue (`TargetFacts.useClient` of its importers). */
  const isUseClient = (ctx: PolicyContext) =>
    ctx.analysis.header.directives.some((d) => d.value === 'use client')
  /** The module's own violation, if its file rule or its marker denies it here. */
  const ownViolation = async (
    ctx: PolicyContext,
    plan: EmitPlan,
  ): Promise<EdgeViolation | null> => {
    const id = ctx.identity.canonicalId
    const path = ctx.identity.path
    // an entry's own marker is judged at its marker import (located there)
    const entry = ip.isEntry(path)
    // (a file name denies only in the scope, and an app file on a client;
    // a marker is a statement of the file wherever it is, and the reason
    // when both deny)
    const rule = await fileOrMarkerRule(
      config,
      ctx.env.type,
      path,
      () => (entry ? null : plan.facts.marker),
      {
        markerFirst: true,
        files:
          ip.inScope(path) ||
          (ctx.env.type === 'client' && isSourceModule(path)),
      },
    )
    if (!rule) {
      return null
    }
    const own = selfViolationOf(
      config,
      ctx.env,
      id,
      rule,
      await describeTarget(id, ctx),
    )
    if (ip.report.rsc && ctx.env.type === 'server' && isUseClient(ctx)) {
      own.useClient = true
    }
    return own
  }
  return {
    name: IMPORT_EDGES_PLANNER,
    tier: 0,
    gate(t0, ctx) {
      if (t0.markers === 'conflict') {
        return true
      }
      const path = ctx.identity.path
      // a module importing nothing can still be its own violation there
      const envType = ctx.config?.type
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
        (envType === 'client' && isSourceModule(path)) ||
        // a marked module is its own violation where its marker denies it,
        // in whatever package
        t0.markers !== null
      )
    },
    plan() {},
    async policy(plan, output, edges, ctx) {
      const clientReferences = ctx.config?.clientReferences === true
      // the module is client references here: its imports are neither
      // resolved (a resolution is a request of the environment: plugin-rsc
      // fails the build on `client-only`) nor judged. Its derived provider
      // output runs here, and is judged.
      if (clientReferences && output === 'env' && isUseClient(ctx)) {
        plan.facts.planners[IMPORT_EDGES_PLANNER] = {
          violations: {},
          edges: { [output]: [] },
          revision: plan.revision,
          clientReferences: true,
        }
        return
      }
      const facts = (plan.facts.planners[IMPORT_EDGES_PLANNER] ??= {
        violations: {},
      })
      if (output === 'env' && plan.facts.marker === 'conflict') {
        ctx.diagnostic(markerConflict(ctx))
      }
      // an exempt importer's imports are only indexed: a denied module it
      // imports is allowed (`ImportProtectionEnv.allowsSelf`)
      const exempt = !ip.inScope(ctx.identity.path)
      // the scope is about importers: on a client an app file outside it is
      // indexed like an exempt importer, and judged itself as a denied file;
      // a marked module is judged itself wherever it is
      const judgedOwn =
        exempt &&
        ((ctx.env.type === 'client' && isSourceModule(ctx.identity.path)) ||
          plan.facts.marker !== null)
      if (exempt && !judgedOwn && !ip.exempt(ctx.identity.path)) {
        return
      }
      const envType = ctx.env.type
      const rules = rulesFor(config, envType)
      const recipe = plan.outputs[output]
      const importerId = recipe?.derivedId ?? ctx.identity.canonicalId
      const typescript =
        ctx.identity.lang === 'ts' || ctx.identity.lang === 'tsx'

      const rewriter = ctx.host.services?.importRewrite
      const judge = async (e: EdgeRecord): Promise<Judged | null> => {
        if (e.provenance.origin === 'runtime') {
          return null
        }
        const raw = e.specifier
        const from = e.importerId
        const importerPath = identify(from).path
        let rule = matchSpecifier(rules, raw)
        // an entry's own marker denies it here (a server-only-marked client
        // entry): its marker import is the violating edge, located at the
        // marker. A marked non-entry module is judged through its importers
        // (an exempt importer gets it, J6.7).
        const ownMarker = ownEntry(ip.markerSpecifiers, raw)
        if (
          rule === null &&
          ownMarker !== undefined &&
          markerViolates(envType, ownMarker) &&
          ip.isEntry(importerPath)
        ) {
          rule = { type: 'marker' }
        }
        let resolved = await ctx.resolve(raw, from)
        let handoff = false
        if (rule === null && !exempt) {
          // a bundler rewrite of the import (Rsbuild `source.transformImport`,
          // inline loaders) makes the rules judge what the bundler loads
          const rewritten = rewriter?.(raw, e.names) ?? null
          for (const spec of rewritten ?? [raw]) {
            const target =
              spec === raw ? resolved : await ctx.resolve(spec, from)
            const specRule = spec === raw ? null : matchSpecifier(rules, spec)
            if (specRule !== null) {
              rule = specRule
              resolved = target
              break
            }
            if (target === null) {
              continue
            }
            // the marker only: an edit of the target's imports or exports does not re-plan its importers
            const targetRule = await fileOrMarkerRule(
              config,
              envType,
              target,
              (id) => ctx.targetMarker(markerIdOf(envType, id)),
            )
            if (targetRule !== null) {
              rule = targetRule
              resolved = target
              // a client reference: nothing of the module runs here, the
              // import hands it to SSR (read only for a denied target:
              // other edges keep the marker-only fingerprint)
              handoff =
                clientReferences && (await ctx.targetFacts(target)).useClient
              break
            }
          }
        }
        const offset = e.locations[0]?.range.start
        return { edge: e, raw, importerPath, resolved, rule, offset, handoff }
      }

      const judged = (
        await Promise.all((edges[output] ?? []).map(judge))
      ).filter((j): j is Judged => j !== null)
      // (the edge index's records of the output: its compile indexes them)
      ;(facts.edges ??= {})[output] = judged
        .filter((j) => j.resolved !== null)
        .map(
          (j): IndexedEdge => ({
            resolved: j.resolved!,
            specifier: j.raw,
            ...(j.offset !== undefined && { offset: j.offset }),
          }),
        )
      facts.revision = plan.revision
      if (judgedOwn && output === 'env') {
        const own = await ownViolation(ctx, plan)
        if (own) {
          facts.violations[output] = [own]
        }
      }
      if (exempt) {
        return
      }

      // (positions in the original file: an SFC's, never the compiled code's)
      const locator = originalPositions(
        ctx.identity.path,
        ctx.code,
        ctx.inputMap,
      )
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
        const erasable =
          !j.handoff &&
          typescript &&
          j.edge.form === 'static' &&
          j.edge.kind === 'evaluation'
        const pending = config.mode === 'dev' && erasable
        // the edge's declarations, each judged on its own (an edge merges
        // every declaration of the specifier: one reading a binding does
        // not make another one's evaluation go)
        const declared = (start: number) =>
          j.edge.locations.some((l) => l.range.start === start)
        const imports =
          j.edge.form === 'static'
            ? ctx.analysis.imports.filter((i) =>
                declared(i.specifierRange.start),
              )
            : []
        const reexports =
          j.edge.form === 'reexport'
            ? ctx.analysis.reexports.filter((r) =>
                declared(r.specifierRange.start),
              )
            : []
        // every specifier written `type`: TypeScript erases the import, or
        // keeps it bare (`verbatimModuleSyntax`)
        const typeOnlyImport = (i: (typeof imports)[number]) =>
          i.specifiers.length > 0 && i.specifiers.every((spec) => spec.typeOnly)
        // a named re-export of no value: `export {} from` evaluates the
        // module in either language, and `export { type T } from` is erased
        // or kept as one
        const emptyReexport = (r: (typeof reexports)[number]) =>
          r.kind === 'named' && !r.typeOnly && r.names.length === 0
        // (one with type specifiers: its statement's re-exported names)
        const typeOnlyReexport = (r: (typeof reexports)[number]) =>
          emptyReexport(r) &&
          ctx.analysis.exports.some(
            (e) =>
              e.kind === 'reExport' &&
              e.range.start >= r.statementRange.start &&
              e.range.end <= r.statementRange.end,
          )
        // a declaration of the edge whose every specifier is a type (its
        // suggestion: `import type`, which no host keeps)
        const typeSpecifiers =
          imports.some(typeOnlyImport) || reexports.some(typeOnlyReexport)
        // a declaration of the edge that evaluates the module whatever it
        // reads of it, as a host may keep it: its mock is evaluated
        const evaluates =
          imports.some(typeOnlyImport) || reexports.some(emptyReexport)
        // a server rendering client-only code: whether it renders it as a component
        const ownStatic = envType === 'server' && j.offset !== undefined
        const offsets = j.edge.locations.map((l) => l.range.start)
        const split =
          recipe?.kind === 'split' && recipe.derivedId !== null
            ? identify(recipe.derivedId).derived
            : null
        const rendered = ownStatic
          ? renderedUse(
              ctx.analysis,
              ctx.code,
              offsets,
              recipe?.segments,
              split?.kind === 'split' ? new Set(split.value.split('~')) : null,
            )
          : null
        // a Vue template renders a component through no JSX: its binding and
        // the export it imports name the fix (a capitalised one: a
        // component's; a namespace's members are no component of their own)
        const specs =
          ownStatic && !rendered && ctx.identity.path.endsWith('.vue')
            ? ctx.analysis.imports
                .filter((i) => offsets.includes(i.specifierRange.start))
                .flatMap((i) =>
                  i.specifiers.filter(
                    (spec) => !spec.typeOnly && !spec.namespace,
                  ),
                )
            : []
        const spec = specs.find((s) => /^[A-Z]/.test(s.localName)) ?? specs[0]
        const content = await edgeModuleContent(edges, j, ctx, evaluates)
        const key = edgeModuleKey(content)
        if (!j.handoff) {
          ctx.substitute(j.edge.edgeKey, ip.ids.request(key, content))
        }
        violations.push({
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
          module: { key, content },
          ...(pending && { pending: true }),
          ...(rendered && {
            rendered: {
              name: rendered.name,
              via: rendered.via,
              ...(rendered.key !== undefined && { key: rendered.key }),
              ...(rendered.alias !== undefined && { alias: rendered.alias }),
              at: locator.at(rendered.start),
            },
          }),
          ...(spec && {
            binding: { name: spec.localName, imported: spec.imported },
          }),
          ...(j.edge.form === 'reexport' && { reexport: true }),
          ...(j.handoff && { handoff: true }),
          ...(typeSpecifiers && { typeSpecifiers: true }),
          ...(ownEntry(ip.markerSpecifiers, j.raw) !== undefined && {
            ownMarker: true,
          }),
        })
      }
      // the module's own violation
      if (output === 'env') {
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

  /**
   * A module importing both markers: the error, at the import of the second
   * marker, naming both.
   */
  function markerConflict(ctx: PolicyContext) {
    const { analysis } = ctx
    const kind = (specifier: string) => ownEntry(ip.markerSpecifiers, specifier)
    // (an import or a re-export: what marks a module)
    const markers = [...analysis.imports, ...analysis.reexports]
      .filter((i) => kind(i.specifier) !== undefined)
      .sort((a, b) => a.specifierRange.start - b.specifierRange.start)
    const first = markers[0]
    const second = markers.find(
      (i) => first !== undefined && kind(i.specifier) !== kind(first.specifier),
    )
    const file = relativizePath(ctx.identity.path, config.root)
    // the first marker in the original file, as a denial names it (the
    // error is at the second)
    const at =
      first &&
      originalPositions(ctx.identity.path, ctx.code, ctx.inputMap).at(
        first.specifierRange.start,
      )
    return {
      severity: 'error' as const,
      message:
        first && second
          ? `[import-protection] ${file} imports both "${first.specifier}"${at ? ` (${relativizePath(at.file, config.root)}:${at.line}:${at.column})` : ''} and "${second.specifier}": a module can be restricted to one environment only. Remove one of the two imports.`
          : `[import-protection] ${file} imports both a server-only and a client-only marker: a module can be restricted to one environment only. Remove one of the two imports.`,
      ...(second && {
        range: {
          start: second.specifierRange.start,
          end: second.specifierRange.end,
        },
      }),
      by: IMPORT_EDGES_PLANNER,
      code: 'import-protection-marker-conflict',
    }
  }

  /** The edge module of a violation: names, whether it is evaluated, and the allowed form. */
  async function edgeModuleContent(
    edges: Readonly<PlanEdges>,
    j: Judged,
    ctx: PolicyContext,
    /** A declaration of the edge evaluates the module as a host may keep it: a type-only import (bare under `verbatimModuleSyntax`), an empty named re-export. */
    evaluates: boolean,
  ): Promise<EdgeModuleContent> {
    // the module's own marker: the marker module is empty
    const ownMarker = ownEntry(ip.markerSpecifiers, j.raw) !== undefined
    // an import that evaluates the module whatever it reads of it (bare,
    // `import()`, `require()`, a type-only one TypeScript keeps bare,
    // `export {} from`, a marker): its mock runs, so the bundler keeps it wherever the import
    // runs; an asset query of a file (its text or URL) runs nothing
    const evaluated =
      (j.resolved === null || !isAssetId(j.resolved)) &&
      (j.edge.form === 'bare' ||
        j.edge.form === 'dynamic' ||
        j.edge.form === 'require' ||
        evaluates ||
        ownMarker)
    const target =
      j.resolved !== null && !ownMarker && j.edge.form !== 'bare'
        ? await describeTarget(j.resolved, ctx)
        : null
    const names = new Set<string>(target?.names ?? [])
    // every name any output of this plan reads through the same logical edge
    for (const list of Object.values(edges)) {
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
      resolved: j.resolved,
      hasDefault: importsDefault || (target?.hasDefault ?? true),
      bare: j.edge.form === 'bare',
      ...(evaluated && { evaluated: true }),
      rule: j.rule!,
    }
  }

  /**
   * What a mock of `resolved` must export: its export names, following
   * `export *`. Every consulted module is a target-facts/resolution
   * fingerprint of this plan (J6.13).
   */
  async function describeTarget(
    resolved: string,
    ctx: PolicyContext,
  ): Promise<TargetDescription> {
    const p = identify(resolved).path
    // a text or URL: its mock exports a default only
    if (/\.json$/i.test(p) || isAssetId(resolved)) {
      return { names: [], hasDefault: true }
    }
    const names = new Set<string>()
    const top = await ctx.targetFacts(resolved)
    const visitedStars = new Set<string>()
    const collect = async (id: string, isTop: boolean): Promise<void> => {
      if (visitedStars.has(id)) {
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
    return {
      names: [...names].filter((n) => n !== 'default'),
      hasDefault: top.exportNames.includes('default') || !top.esm,
    }
  }
}
