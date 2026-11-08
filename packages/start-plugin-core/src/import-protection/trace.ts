import path from 'node:path'
import { identify } from '@tanstack/router-utils/compiler'
import { Locator } from './locate'
import { findPatternImport, relativeSpecifier } from './pattern-imports'
import { relativizePath } from './utils'
import type { ImportProtectionConfig } from './config'
import type { CodeFrame, OriginalLocation } from './locate'
import type { SourceReader, Trace } from './graph-trace'
import type { PatternImport } from './pattern-imports'
import type { EdgeViolation, ReportedInfo } from './violations'
import type { CompileStartFrameworkOptions } from '../types'

export interface TraceStep {
  file: string
  specifier?: string
  line?: number
  column?: number
}

export interface Loc {
  file?: string
  line: number
  column: number
}

export interface ViolationInfo {
  env: string
  envType: 'client' | 'server'
  type: 'specifier' | 'file' | 'marker'
  behavior: 'error' | 'mock'
  pattern?: string | RegExp
  specifier: string
  importer: string
  importerLoc?: Loc
  resolved?: string
  trace: Array<TraceStep>
  /** Vitest-style code snippet showing the offending usage in the leaf module. */
  snippet?: {
    lines: Array<string>
    highlightLine: number
    location: string
  }
}

/**
 * What `allowImport` receives. It runs while the build still loads modules:
 * no `trace` (the graph is not finished) and no `snippet` (source rendered for
 * a report). `importerLoc` is absent for an importer a persistent cache
 * restored whose record is not read yet.
 */
export type AllowImportInfo = Omit<ViolationInfo, 'trace' | 'snippet'>

/**
 * Suggestion strings for server-only code leaking into client environments.
 * Used by both `formatViolation` (terminal) and runtime mock modules (browser).
 */
export const CLIENT_ENV_SUGGESTIONS = [
  'Use createServerFn().handler(() => ...) to keep the logic on the server and call it from the client via an RPC bridge',
  'Use createServerOnlyFn(() => ...) to mark it as server-only (it will throw if accidentally called from the client)',
  'Use createIsomorphicFn().client(() => ...).server(() => ...) to provide separate client and server implementations',
  'Split the file: move the code that uses this import into a .server.ts module, and import that module only from server code (server functions, server routes, middleware .server())',
] as const

/** Client-only code on the server, used as a function (not rendered as a component). */
const SERVER_FN_SUGGESTIONS = [
  'If it runs only in the browser (an effect, an event handler), wrap it in createClientOnlyFn(() => ...): it throws if called on the server, including while rendering on the server',
  'Use createIsomorphicFn().client(() => ...).server(() => ...) to provide separate client and server implementations',
  'Split the file: move the code that uses this import into a .client.ts module, and import that module only from client code',
] as const

/** A mocked module that is its own violation (the mock runtime: its importer is not known there). */
export const PATTERN_IMPORT_SUGGESTION =
  "Exclude it from the pattern import that matches it (for import.meta.glob, a negative pattern: '!' and the file's path relative to the importer), or move the file out of the directory the pattern reads"

const quoted = (s: string) =>
  `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** The router package a framework's `<ClientOnly>` comes from. */
const routerPackage = (framework: CompileStartFrameworkOptions) =>
  `@tanstack/${framework}-router`

/** The `<ClientOnly>` suggestion for an import that may be a component (not known from its use). */
const clientOnlySuggestion = (framework: CompileStartFrameworkOptions) =>
  `If it is a component, render it inside <ClientOnly fallback={...}>...</ClientOnly> (from ${routerPackage(framework)}): the server renders the fallback, the browser the component after hydration`

/**
 * A component a Vue template renders: `<ClientOnly>` in a template keeps the
 * import on the server, so the component is loaded in the browser only too
 * (`createClientOnlyFn` around its `import()`, which the server never calls
 * inside `<ClientOnly>`).
 */
const vueComponentSuggestion = (name: string, specifier: string) =>
  `If it is a component of the template, load it in the browser only and render it inside <ClientOnly>: const ${name} = defineAsyncComponent(createClientOnlyFn(() => import(${quoted(specifier)}))) in the script (defineAsyncComponent from vue, createClientOnlyFn from @tanstack/vue-start), and <ClientOnly><${name} /></ClientOnly> in the template (from @tanstack/vue-router)`

/** Where the mock runtime puts the denied import's specifier (`serverEnvSuggestions`). */
export const SPECIFIER_SLOT = '__SPECIFIER__'

/**
 * Suggestion strings for client-only code leaking into server environments,
 * when how the import is used is not known (the mock runtime, a Vue
 * template): a component is rendered inside `<ClientOnly>`, a function
 * wrapped in `createClientOnlyFn`.
 */
export function serverEnvSuggestions(
  framework: CompileStartFrameworkOptions,
): Array<string> {
  return [
    clientOnlySuggestion(framework),
    ...(framework === 'vue'
      ? [vueComponentSuggestion('Component', SPECIFIER_SLOT)]
      : []),
    ...SERVER_FN_SUGGESTIONS,
  ]
}

/** What formatting a report reads besides the violation: the configuration, raw sources (markers, pattern imports), the framework. */
export interface ReportContext {
  config: ImportProtectionConfig
  readSource: SourceReader
  framework: CompileStartFrameworkOptions
}

/** The raw text of `file` located: the 1-based position of `offset` and its code frame. */
function locateIn(
  readSource: SourceReader,
  file: string,
  offset: (text: string) => number | null,
): { loc: OriginalLocation; frame: CodeFrame | null } | null {
  const text = readSource(file)
  const at = text === null ? null : offset(text)
  if (text === null || at === null) {
    return null
  }
  const locator = new Locator(text, file, () => null)
  const loc = locator.at(at)
  return loc && { loc, frame: locator.frame(loc) }
}

/** The marker import that restricts `file` (the kind a violation in `envType` is denied by), with its line. */
function markerOf(
  ctx: ReportContext,
  file: string,
  envType: 'client' | 'server',
): { specifier: string; line: number | null } | null {
  const kind = envType === 'client' ? 'server-only' : 'client-only'
  const specifiers = Object.entries(ctx.config.markerSpecifiers)
    .filter(([, k]) => k === kind)
    .map(([s]) => s)
  let found: string | null = null
  const site = locateIn(ctx.readSource, file, (text) => {
    let best: number | null = null
    for (const s of specifiers) {
      for (const quote of ["'", '"']) {
        const i = text.indexOf(`${quote}${s}${quote}`)
        if (i >= 0 && (best === null || i < best)) {
          best = i
          found = s
        }
      }
    }
    return best
  })
  return found === null
    ? null
    : { specifier: found, line: site?.loc.line ?? null }
}

function deniedBy(info: ViolationInfo, ctx: ReportContext): string {
  if (info.type !== 'marker') {
    return `  Denied by ${info.type} pattern: ${String(info.pattern)}`
  }
  // the marked module: the import's target, or an entry whose own marker denies it
  const marked = info.resolved ?? info.importer
  const marker = markerOf(ctx, identify(marked).path, info.envType)
  const restricted = info.envType === 'client' ? 'the server' : 'the client'
  return marker
    ? `  Denied by marker: ${relativizePath(marked, ctx.config.root)} imports "${marker.specifier}"${marker.line !== null ? ` (line ${marker.line})` : ''}, which restricts it to ${restricted}`
    : `  Denied by marker: ${relativizePath(marked, ctx.config.root)} is restricted to ${restricted}`
}

/**
 * A build's warning (not a violation): a denied file served as its mock to
 * importers import protection does not check (KNOWN-BUGS.md, R89).
 */
export function formatUncheckedImporters(
  info: ViolationInfo,
  importers: Array<string>,
  root: string,
): string {
  return [
    ``,
    `[import-protection] Denied file mocked in ${info.envType} environment, for importers that are not checked`,
    ``,
    `  Denied by ${info.type} pattern: ${String(info.pattern)}`,
    `  Denied file: ${relativizePath(info.importer, root)}`,
    `  Importers (exempt by exclude/ignoreImporters, or outside include/srcDirectory):`,
    ...importers.map((file) => `    - ${relativizePath(file, root)}`),
    ``,
    `  Not a violation: these importers get the mock, so nothing of the file ships to the ${info.envType}.`,
    `    - If they should be checked, move them inside srcDirectory/include (or out of exclude/ignoreImporters)`,
    `    - If they need the real module, import the file statically from a module that exclude/ignoreImporters exempts inside the scope: the file then ships to the ${info.envType}`,
    ``,
  ].join('\n')
}

/** Where a pattern import matched the denied file (`formatViolation`). */
interface PatternSite {
  importer: string
  found: PatternImport | null
  loc: OriginalLocation | null
  frame: CodeFrame | null
}

/**
 * The pattern import of a module that is its own violation: a build's
 * importer (`EdgeViolation.pattern`, located when it was recorded), or, in
 * dev, the importer the graph knows, the trace's step before the module.
 */
function patternSiteOf(
  v: EdgeViolation,
  info: ViolationInfo,
  trace: Trace,
  ctx: ReportContext,
): PatternSite | null {
  if (v.pattern !== undefined) {
    return {
      importer: info.importer,
      found: v.pattern,
      loc: v.loc,
      frame: v.snippet,
    }
  }
  const denied = info.resolved ?? info.importer
  const before = [...trace.steps]
    .reverse()
    .find((s) => identify(s.file).path !== denied)
  if (!v.self || !before) {
    return null
  }
  const importer = identify(before.file).path
  let found: PatternImport | null = null
  const site = locateIn(ctx.readSource, importer, (text) => {
    found = findPatternImport(text, importer, denied, ctx.config.root)
    return (found as PatternImport | null)?.offset ?? null
  })
  return {
    importer,
    found,
    loc: site?.loc ?? null,
    frame: site?.frame ?? null,
  }
}

/** The fix of a pattern import that matched a denied file: leave the file out of the pattern. */
function patternSuggestions(
  denied: string,
  site: PatternSite | null,
  mode: 'dev' | 'build',
): Array<string> {
  if (!site?.found) {
    return [
      `Exclude it from the pattern import that matches it (for import.meta.glob, add a negative pattern such as '!./${path.posix.basename(denied)}', relative to the importer), or move the file out of the directory the pattern reads`,
      ...(mode === 'dev'
        ? [
            'If nothing imports it (a server.warmup glob requested it), the environment gets its mock and nothing of the file ships',
          ]
        : []),
    ]
  }
  const exclusion = `!${relativeSpecifier(site.importer, denied)}`
  switch (site.found.kind) {
    case 'import.meta.glob':
      return [
        site.found.patterns
          ? `Exclude it from the pattern: import.meta.glob([${[...site.found.patterns, exclusion].map(quoted).join(', ')}], ...)`
          : `Exclude it from the pattern with a negative pattern: ${quoted(exclusion)}`,
        'Or move the file out of the directory the pattern reads',
      ]
    case 'import.meta.webpackContext':
    case 'require.context':
      return [
        `Narrow the context's regExp so it does not match ${path.posix.basename(denied)}, or move the file out of the directory the context reads`,
      ]
    case 'import()':
      return [
        'Move the file out of the directory the template literal reads, or import the modules it needs by name',
      ]
  }
}

/** The fix of client-only code a server renders as a component (`EdgeViolation.rendered`). */
function renderedSuggestion(
  v: EdgeViolation,
  ctx: ReportContext,
): Array<string> {
  const r = v.rendered!
  const where = r.at
    ? ` (${relativizePath(r.at.file, ctx.config.root)}:${r.at.line}:${r.at.column})`
    : ''
  const from = `ClientOnly from ${routerPackage(ctx.framework)}`
  return r.via === 'jsx'
    ? [
        `<${r.name}> renders it on the server${where}: render it inside <ClientOnly fallback={...}><${r.name} /></ClientOnly> (${from}), so the server renders the fallback and the browser the component after hydration`,
      ]
    : [
        `The route option ${r.key}: ${r.name} renders it on the server${where}: write ${r.key}: () => <ClientOnly fallback={...}><${r.name} /></ClientOnly> (${from}), so the server renders the fallback and the browser the component after hydration`,
      ]
}

function suggestionsOf(
  v: EdgeViolation,
  info: ViolationInfo,
  ctx: ReportContext,
  site: PatternSite | null,
): Array<string> {
  if (v.self || v.pattern !== undefined) {
    return patternSuggestions(
      identify(info.resolved ?? info.importer).path,
      site,
      ctx.config.mode,
    )
  }
  const barrel = v.reexport
    ? [
        `This module re-exports it (export ... from): split the barrel, so ${info.envType} code imports a module without this re-export (see "Mixed Barrels" in the import protection guide)${ctx.config.mode === 'dev' ? '. A build leaves the re-export out while nothing uses it; the dev server serves the whole module' : ''}`,
      ]
    : []
  if (v.reexport && ctx.config.mode === 'dev') {
    return barrel
  }
  if (info.envType === 'client') {
    return [...barrel, ...CLIENT_ENV_SUGGESTIONS]
  }
  if (v.rendered) {
    return [...barrel, ...renderedSuggestion(v, ctx)]
  }
  // a Vue template's components are no JSX of the script: how it is used is unknown
  return v.binding !== undefined
    ? [
        ...barrel,
        vueComponentSuggestion(v.binding, info.specifier),
        ...SERVER_FN_SUGGESTIONS,
      ]
    : [...barrel, ...SERVER_FN_SUGGESTIONS]
}

/** Whether a trace step's file is the app's own (not a package's, not virtual). */
const isAppFile = (file: string, root: string) =>
  file.startsWith(`${root}/`) && !file.includes('/node_modules/')

/**
 * The steps a report prints: from the first file of the app (the framework's
 * own entry modules left out), each file once in a row (a route module and
 * its split module), cut at `maxTraceDepth` on the entry side.
 */
function printedSteps(
  trace: Trace,
  root: string,
  maxDepth: number,
): { steps: Array<TraceStep>; first: number; entry: boolean } {
  let start = trace.steps.findIndex((s) => isAppFile(s.file, root))
  if (start < 0) {
    start = trace.steps.length - 1
  }
  const steps = trace.steps
    .slice(start)
    .filter((s, i, all) => all[i + 1]?.file !== s.file)
  const keep = Math.max(1, maxDepth + 1)
  const cut = Math.max(0, steps.length - keep)
  return {
    steps: steps.slice(cut),
    first: cut + 1,
    entry: trace.fromEntry && cut === 0,
  }
}

export function formatViolation(
  v: EdgeViolation,
  info: ReportedInfo,
  ctx: ReportContext,
): string {
  const { root } = ctx.config
  const rel = (p: string) => relativizePath(p, root)
  const at = (file: string, loc: { line: number; column: number } | null) =>
    loc ? `${rel(file)}:${loc.line}:${loc.column}` : rel(file)
  const trace = info.freezeTrace()
  const site = patternSiteOf(v, info, trace, ctx)

  const lines: Array<string> = []
  lines.push(``)
  lines.push(
    `[import-protection] Import ${info.behavior === 'mock' ? 'mocked' : 'denied'} in ${info.envType} environment`,
  )
  lines.push(``)
  lines.push(deniedBy(info, ctx))

  if (v.self || v.pattern !== undefined) {
    lines.push(`  Denied file: ${rel(info.resolved ?? info.importer)}`)
    lines.push(
      site?.found
        ? `  Matched by: ${site.found.kind === 'import()' ? 'a template literal import()' : site.found.kind} in ${at(site.importer, site.loc)}`
        : site
          ? `  Matched by: a pattern import in ${rel(site.importer)} (import.meta.glob, a template literal import(), import.meta.webpackContext)`
          : `  Loaded by an import the compiler does not read: a pattern import (import.meta.glob, a template literal import(), import.meta.webpackContext) or a request of the file itself (a server.warmup glob)`,
    )
  } else {
    const loc = info.importerLoc
    lines.push(
      `  Importer: ${loc ? at(loc.file ?? info.importer, loc) : rel(info.importer)}`,
    )
    lines.push(`  Import: "${rel(info.specifier)}"`)
    if (info.resolved) {
      lines.push(`  Resolved: ${rel(info.resolved)}`)
    }
  }

  const printed = printedSteps(trace, root, ctx.config.maxTraceDepth)
  // a lone step is the importer the lines above name: the graph knew nothing more
  if (printed.steps.length > 1 || printed.entry) {
    lines.push(``)
    lines.push(`  Trace:`)
    if (printed.first > 1) {
      lines.push(
        `    ... ${printed.first - 1} earlier step${printed.first > 2 ? 's' : ''} (raise importProtection.maxTraceDepth to see them)`,
      )
    }
    printed.steps.forEach((step, i) => {
      const last = i === printed.steps.length - 1
      let loc =
        step.line != null ? { line: step.line, column: step.column ?? 1 } : null
      let spec = step.specifier ? ` (import "${step.specifier}")` : ''
      const file = identify(step.file).path
      if (
        site &&
        file === site.importer &&
        (v.pattern !== undefined || !last)
      ) {
        // the step of the pattern import's importer: the call, not a specifier
        loc = site.loc
        spec = site.found
          ? ` (${site.found.kind === 'import()' ? 'a template literal import()' : site.found.kind})`
          : ''
      } else if (v.self && last) {
        spec = ''
      }
      const tag = i === 0 && printed.entry ? ' (entry)' : ''
      lines.push(`    ${printed.first + i}. ${at(step.file, loc)}${tag}${spec}`)
    })
  }

  const frame = info.snippet ?? site?.frame ?? null
  if (frame) {
    lines.push(``)
    lines.push(`  Code:`)
    for (const snippetLine of frame.lines) {
      lines.push(snippetLine)
    }
    lines.push(``)
    lines.push(`  ${rel(frame.location)}`)
  }

  lines.push(``)
  lines.push(`  Suggestions:`)
  for (const s of suggestionsOf(v, info, ctx, site)) {
    lines.push(`    - ${s}`)
  }
  lines.push(``)
  return lines.join('\n')
}
