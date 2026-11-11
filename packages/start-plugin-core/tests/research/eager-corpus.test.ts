/**
 * Research lane (not committed): compiles every route file of each corpus
 * app (or each sampled route file) on the client, build mode, with Start's
 * planners + the router planner (Start apps) or the router planner alone
 * (router-plugin apps, autoCodeSplitting on), and writes one JSONL record
 * per compiled route file: env module bytes and every eager-split /
 * eager-export diagnostic with the declaration text.
 *
 * EC_MODE=apps|files  EC_OUT=<jsonl>  EC_PURE=none|fw|libs (extra pure-call table)
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { it } from 'vitest'
import { createHash } from 'node:crypto'
const emitMod: any = await import(`${process.env.EC_CO}/packages/router-utils/dist/esm/compiler/emit.js`)
const obMod: any = await import(`${process.env.EC_CO}/packages/router-utils/dist/esm/compiler/output-builder.js`)
const seenEntries = new Set<unknown>()
const sha = (x: string) => createHash('sha1').update(x.split(process.env.EC_CO!).join('<CO>')).digest('hex')

import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
  fileModifiedAt,
} from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routerPlanner,
  routerPlannerConfigFrom,
  knownPureCalls,
} from '@tanstack/router-plugin/planners'
import * as routerPlanners from '@tanstack/router-plugin/planners'
// (optional: removed by design 6)
const routeRefreshMarkers = (routerPlanners as any).routeRefreshMarkers as undefined | ((r: unknown) => unknown)
import { startRecognizer } from '../../src/compiler/recognizer'
import { START_ENV, startPlanners } from '../../src/planners'
import { HYDRATE_PLANNER, createHydratePlanner } from '../../src/planners/hydrate'
import type { HostServices } from '@tanstack/router-utils/compiler'

const SKIP_DIR = /^(node_modules|dist|build|\.output|\.vinxi|\.nitro|\.tanstack|\.wrangler|\.git|\.next|coverage|\.turbo|\.vercel|\.netlify)$/
const EXT = /\.(tsx?|jsx?|mts|mjs)$/
const ROUTE_TEXT = /\bcreate(FileRoute|RootRoute|RootRouteWithContext|LazyFileRoute)\b/
const TEST = /(\.(test|spec|stories)\.[cm]?[jt]sx?$)/
const EXCLUDED_ROOTS = /\/(reference|repos)\/tanstack-router$|Rykuno__router/

/** Candidate pure-call tables (R114 study): framework APIs, then popular libraries. */
const FW: Record<string, Array<string>> = {
  react: ['memo', 'forwardRef', 'createContext', 'lazy'],
  'solid-js': ['createContext', 'lazy'],
  'solid-js/web': [],
  vue: ['defineComponent', 'defineAsyncComponent'],
}
const LIBS: Record<string, Array<string>> = {
  'class-variance-authority': ['cva'],
  cva: ['cva'],
  'tailwind-variants': ['tv'],
  clsx: ['clsx'],
  'tailwind-merge': ['twMerge'],
}
/** The branch's table (base: a Record; candidate: { pureCalls, pureDefaultNamespaces }). */
function pureTable(): Record<string, unknown> {
  const k = knownPureCalls() as any
  const t = 'pureCalls' in k ? k : { pureCalls: k }
  if (process.env.EC_PURE !== 'ctx') {
    return t
  }
  const add = (spec: string, names: Array<string>) => new Set([...(t.pureCalls[spec] ?? []), ...names])
  return { ...t, pureCalls: { ...t.pureCalls, react: add('react', ['createContext', 'createRef']), 'solid-js': add('solid-js', ['createContext']) } }
}

function listFiles(root: string, out: Array<string> = []): Array<string> {
  let entries: Array<string>
  try {
    entries = readdirSync(root)
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIR.test(e)) {
      continue
    }
    const p = join(root, e)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      listFiles(p, out)
    } else if (EXT.test(e) && !e.endsWith('.d.ts') && !e.includes('routeTree.gen') && st.size < 400_000) {
      out.push(p)
    }
  }
  return out
}

function aliasesOf(root: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const name of ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json']) {
    const p = join(root, name)
    if (!existsSync(p)) {
      continue
    }
    try {
      const text = readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/,(\s*[}\]])/g, '$1')
      const json = JSON.parse(text)
      const base = join(root, json.compilerOptions?.baseUrl ?? '.')
      for (const [k, v] of Object.entries<Array<string>>(json.compilerOptions?.paths ?? {})) {
        if (k.endsWith('/*') && v[0]?.endsWith('/*')) {
          out.push([k.slice(0, -1), join(base, v[0].slice(0, -1))])
        } else if (!k.includes('*') && v[0]) {
          out.push([k, join(base, v[0])])
        }
      }
    } catch {
      // ignore
    }
  }
  const src = existsSync(join(root, 'src')) ? join(root, 'src') : existsSync(join(root, 'app')) ? join(root, 'app') : root
  for (const p of ['~/', '@/', '#/']) {
    if (!out.some(([k]) => k === p)) {
      out.push([p, `${src}/`])
    }
  }
  return out
}

class DiskHost {
  readonly rawFacts: RawFactsCache
  readonly caches
  constructor(
    private readonly aliases: Array<[string, string]>,
    start: boolean,
  ) {
    const pure = pureTable()
    const recognizer = start
      ? { ...startRecognizer(), ...pure }
      : { ...pure }
    ;(globalThis as any).__EC_RECOGNIZER = start ? recognizer : undefined
    this.rawFacts = new RawFactsCache({
      readFile: (p) => this.readFile(p),
      loadVirtual: () => Promise.resolve(null),
      recognizer: recognizer as any,
    })
    this.caches = createCompilerCaches(this.rawFacts)
  }
  private probe(base: string): string | null {
    for (const c of [
      base,
      ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'].map((x) => base + x),
      ...['/index.ts', '/index.tsx', '/index.js', '/index.jsx'].map((x) => base + x),
    ]) {
      try {
        if (statSync(c).isFile()) {
          return c
        }
      } catch {
        // next
      }
    }
    const m = /\.(m?js|jsx)$/.exec(base)
    if (m) {
      return this.probe(base.slice(0, -m[0].length))
    }
    return null
  }
  resolve(specifier: string, importer: string): Promise<{ id: string } | null> {
    const from = dirname(importer.split('?')[0]!)
    if (specifier.startsWith('.')) {
      const hit = this.probe(join(from, specifier))
      return Promise.resolve(hit ? { id: hit } : null)
    }
    for (const [prefix, dir] of this.aliases) {
      if (specifier === prefix.replace(/\/$/, '') || specifier.startsWith(prefix)) {
        const hit = this.probe(join(dir, specifier.slice(prefix.length)))
        if (hit) {
          return Promise.resolve({ id: hit })
        }
      }
    }
    return Promise.resolve(null)
  }
  readFile(path: string): Promise<string | null> {
    try {
      return Promise.resolve(normalize(readFileSync(path, 'utf8')))
    } catch {
      return Promise.resolve(null)
    }
  }
}

/** EC_IV=1: the current server-fn API (`.inputValidator(` written by older apps → `.validator(`). */
function normalize(code: string): string {
  return process.env.EC_IV === '1' ? code.replaceAll('.inputValidator(', '.validator(') : code
}

interface App {
  name: string
  root: string
  files: Array<string>
  start: boolean
  framework: 'react' | 'solid' | 'vue'
}

function depsOf(root: string): Record<string, string> {
  // nearest package.json at or above the root (monorepo apps)
  for (let d = root; d.length > 1; d = dirname(d)) {
    const p = join(d, 'package.json')
    if (existsSync(p)) {
      try {
        const j = JSON.parse(readFileSync(p, 'utf8'))
        const deps = { ...j.dependencies, ...j.devDependencies }
        if (Object.keys(deps).some((k) => k.startsWith('@tanstack/'))) {
          return deps
        }
      } catch {
        // next
      }
    }
    if (d === '/var/tmp/r84-gh/repos') {
      break
    }
  }
  return {}
}

function frameworkOf(text: string, deps: Record<string, string>): App['framework'] {
  if (/@tanstack\/solid-(router|start)/.test(text) || deps['@tanstack/solid-router'] || deps['@tanstack/solid-start']) {
    return 'solid'
  }
  if (/@tanstack\/vue-(router|start)/.test(text) || deps['@tanstack/vue-router'] || deps['@tanstack/vue-start']) {
    return 'vue'
  }
  return 'react'
}

function isRouteFile(rel: string, code: string): boolean {
  return (
    /(^|\/)routes\//.test(rel) &&
    !TEST.test(rel) &&
    !/(^|\/)-/.test(rel.slice(rel.indexOf('routes/') + 7)) &&
    ROUTE_TEXT.test(code)
  )
}

function appsFromClones(): Array<App> {
  const roots = readFileSync('/home/flo/compiler-rewrite-notes/r84-study/r84-clone-roots.txt', 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((r) => !EXCLUDED_ROOTS.test(r))
  // each file belongs to its deepest root
  const owner = new Map<string, string>()
  for (const root of [...roots].sort((a, b) => a.length - b.length)) {
    for (const f of listFiles(root)) {
      owner.set(f, root)
    }
  }
  const apps = new Map<string, App>()
  for (const [f, root] of owner) {
    const rel = f.slice(root.length + 1)
    if (!/(^|\/)routes\//.test(rel)) {
      continue
    }
    const code = readFileSync(f, 'utf8')
    if (!isRouteFile(rel, code)) {
      continue
    }
    let app = apps.get(root)
    if (!app) {
      const deps = depsOf(root)
      const start = Object.keys(deps).some((k) => /^@tanstack\/(react|solid|vue)-start$/.test(k))
      app = { name: root.slice('/var/tmp/r84-gh/repos/'.length), root, files: [], start, framework: frameworkOf('', deps) }
      apps.set(root, app)
    }
    app.files.push(f)
  }
  return [...apps.values()]
}

function appsFromSamples(): Array<App> {
  const cloned = new Set(readdirSync('/var/tmp/r84-gh/repos'))
  const base = '/var/tmp/r84-gh/files'
  const out: Array<App> = []
  for (const repo of readdirSync(base)) {
    if (cloned.has(repo)) {
      continue
    }
    const root = join(base, repo)
    const files = listFiles(root).filter((f) => {
      const rel = f.slice(root.length + 1)
      return isRouteFile(rel, readFileSync(f, 'utf8'))
    })
    if (files.length === 0) {
      continue
    }
    const all = listFiles(root).map((f) => readFileSync(f, 'utf8')).join('\n')
    const start = /@tanstack\/(react|solid|vue)-start/.test(all)
    out.push({ name: repo, root, files, start, framework: frameworkOf(all, {}) })
  }
  return out
}

function routeIdOf(code: string, rel: string): string {
  const m = /create(?:Lazy)?FileRoute\(\s*(['"`])([^'"`]*)\1/.exec(code)
  if (m) {
    return m[2]!
  }
  if (/createRootRoute/.test(code)) {
    return '/__root'
  }
  return `/${rel}`
}

const ENV_TYPE: 'client' | 'server' = process.env.EC_ENV === 'server' ? 'server' : 'client'

it('eager corpus', { timeout: 7_200_000 }, async () => {
  const mode = process.env.EC_MODE
  const outFile = process.env.EC_OUT
  if (!mode || !outFile) {
    return
  }
  writeFileSync(outFile, '')
  const apps =
    mode === 'dir'
      ? [{ name: process.env.EC_ROOT!, root: process.env.EC_ROOT!, files: listFiles(process.env.EC_ROOT!).filter((f) => isRouteFile(f.slice(process.env.EC_ROOT!.length + 1), readFileSync(f, 'utf8'))), start: true, framework: 'react' as const }]
      : mode === 'apps'
        ? appsFromClones()
        : appsFromSamples()
  for (const app of apps) {
    const host = new DiskHost(aliasesOf(app.root), app.start)
    const entries = new Map<string, string>()
    const codes = new Map<string, string>()
    for (const f of app.files) {
      const code = normalize(readFileSync(f, 'utf8'))
      codes.set(f, code)
      entries.set(f, routeIdOf(code, f.slice(app.root.length + 1)))
    }
    const routes: NonNullable<HostServices['routes']> = {
      lookup: (path) => {
        const id = entries.get(path)
        return id === undefined ? null : { routeId: id, routerConstructor: true }
      },
      digestFor: (path) => {
        const id = entries.get(path)
        return id === undefined ? null : `${id}\u0000router`
      },
    }
    const services: HostServices = {
      resolve: app.start ? (s, i) => host.resolve(s, i) : () => Promise.resolve(null),
      rawFacts: host.rawFacts,
      root: app.root,
      tag: app.start ? '[tanstack-start]' : '[tanstack-router]',
      routes,
      modifiedAt: fileModifiedAt,
    }
    const router = routerPlannerConfigFrom(process.env.EC_SPLITALL === '1' ? { defaultBehavior: [['loader'], ['component'], ['pendingComponent'], ['errorComponent'], ['notFoundComponent']] } : undefined, {
      framework: app.framework,
      envType: ENV_TYPE,
      mode: 'build',
      hmrStyle: 'vite',
      start: app.start,
      autoCodeSplitting: true,
    })
    const planners = app.start
      ? startPlanners({ hydrate: createHydratePlanner(), router: routerPlanner() })
      : [routerPlanner()]
    const config = app.start
      ? {
          configKey: 'cfg',
          perPlanner: {
            [START_ENV]: { framework: app.framework, root: app.root, providerSeparate: process.env.EC_RSC === '1', idMode: 'dev' },
            [HYDRATE_PLANNER]: { root: app.root, ...(routeRefreshMarkers ? { refreshMarkers: routeRefreshMarkers(router) } : {}) },
            [ROUTER_PLANNER]: router,
          } as Record<string, unknown>,
        }
      : { configKey: 'cfg', perPlanner: { [ROUTER_PLANNER]: router } as Record<string, unknown> }
    for (const file of app.files) {
      const code = codes.get(file)!
      let out
      try {
        out = await compileModule(
          { id: file, code, env: { name: ENV_TYPE === 'client' ? 'client' : 'ssr', type: ENV_TYPE, mode: 'build' }, planners, config, wantMap: false },
          services,
          host.caches,
        )
      } catch (e) {
        appendFileSync(outFile, `${JSON.stringify({ app: app.name, file, start: app.start, fw: app.framework, kind: 'throw', message: String(e).slice(0, 300) })}\n`)
        continue
      }
      if (process.env.EC_DUMP && file.includes(process.env.EC_DUMP)) {
        const chunk = await compileModule(
          { id: `${file}?tsr-split=component`, code, env: { name: ENV_TYPE === 'client' ? 'client' : 'ssr', type: ENV_TYPE, mode: 'build' }, planners, config, wantMap: false },
          services,
          host.caches,
        )
        appendFileSync(`${outFile}.dump`, `===== ${file}\n----- route module\n${out?.code}\n----- component chunk\n${chunk?.code}\n`)
      }
      // every output of the plan(s) this compile published: bytes (code and map) and recipe
      const outs: Array<string> = []
      const recipes: Array<string> = []
      for (const pc of (host.caches as any).plans.values()) {
        const es = (pc as any).entries
          ? [...(pc as any).entries.values()]
          : [...(pc as any).records.values()].map((r: any) => r.entry).filter(Boolean)
        for (const e of es) {
          if (seenEntries.has(e)) continue
          seenEntries.add(e)
          const src = new obMod.SourceText(code)
          for (const k of Object.keys(e.plan.outputs).sort()) {
            const r = emitMod.emitRecipe(e.plan.outputs[k], src, true)
            outs.push(`${k}\n${r.code}\n${JSON.stringify(r.map)}`)
            recipes.push(`${k}\n${JSON.stringify(e.plan.outputs[k])}`)
          }
          outs.push(JSON.stringify(e.plan.diagnostics) + JSON.stringify(e.plan.edges) + JSON.stringify(e.plan.facts) + JSON.stringify(e.plan.sideEffects))
        }
      }
      const bytesHash = sha(outs.join('\n\u0000'))
      const planHash = sha(recipes.join('\n\u0000'))
      const outHash = sha(`${out?.code}`)
      const diags = (out?.diagnostics ?? [])
        .filter((d) => d.code?.startsWith('eager-') || d.code?.startsWith('not-split:'))
        .map((d) => ({
          code: d.code,
          message: d.message,
          start: d.range?.start,
          end: d.range?.end,
          text: d.range ? code.slice(d.range.start, d.range.end) : null,
        }))
      const other = (out?.diagnostics ?? []).filter((d) => !d.code?.startsWith('eager-') && !d.code?.startsWith('not-split:')).map((d) => d.code ?? d.message.slice(0, 80))
      appendFileSync(
        outFile,
        `${JSON.stringify({ app: app.name, file, start: app.start, fw: app.framework, kind: 'ok', bytesHash, planHash, outHash, srcBytes: code.length, envBytes: out?.code.length ?? code.length, envImports: [...new Set([...(out?.code ?? code).matchAll(/^import\s[^;]*?from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]))], diags, other })}\n`,
      )
    }
  }
})
