/**
 * Edge modules (J6.3, J6.8): the per-edge module a
 * violating import is substituted with, its two states, the mock runtime of
 * an environment, and the ids hosts serve them under.
 *
 * - `mock`: a pure module that owns its exports (string export names: any
 *   spelling), each a `/* @__PURE__ *\/` mock creation, plus one `__fx(…)`
 *   call (the effect witness) when the denied target has top-level effects.
 *   It is the survival witness in builds: bundlers keep an owned
 *   export only where the importer's binding survives, and keep `__fx` only
 *   where the importer is evaluated.
 * - `allowed` (`allowImport` → true): a transparent re-export of the real
 *   module, side effects left to the bundler. The mock is never produced for
 *   it: the host asks before it loads the module (`ImportProtectionEnv.confirm`).
 * - the runtime (one per environment, side-effect free): the recursive
 *   mock Proxy with the `mockAccess` diagnostics, in every environment and
 *   mode (J6.3).
 */
import {
  canonicalJson,
  digestOf,
  isValidIdentifier,
  normalizePath,
  stringLiteral,
} from '@tanstack/router-utils/compiler'
import {
  CLIENT_ENV_SUGGESTIONS,
  PATTERN_IMPORT_SUGGESTION,
  SPECIFIER_SLOT,
  serverEnvSuggestions,
} from './trace'
import type { MockAccess } from './config'
import type { RuleRef } from './rules'
import type { CompileStartFrameworkOptions } from '../types'

const EDGE_MODULE_PREFIX = 'tanstack-start-ip:'

/** One of our modules: a per-edge module (by edge key and content hash) or an environment's runtime. */
export type EdgeModuleRef =
  | { env: string; kind: 'edge'; key: string }
  | { env: string; kind: 'runtime' }

/**
 * How a host names our modules: the module's id (the runtime specifier
 * edge modules import; Rspack: the virtual file), the request an importer
 * imports an edge module by, and the module a bundler id or resource names
 * (any query, `\0` or `/@id/__x00__` prefix; null when it is not ours).
 */
export interface EdgeModuleIds {
  specifier: (ref: EdgeModuleRef) => string
  request: (key: string, content: EdgeModuleContent) => string
  parse: (idOrResource: string) => EdgeModuleRef | null
  /** The content a request carries (Rspack), checked against its key; null otherwise. */
  content?: (request: string) => EdgeModuleContent | null
}

/** `<env>/edge.<key>` or `<env>/runtime`. */
function edgeModuleName(ref: EdgeModuleRef): string {
  const env = encodeURIComponent(ref.env)
  return ref.kind === 'edge' ? `${env}/edge.${ref.key}` : `${env}/runtime`
}

function parseEdgeModuleName(name: string): EdgeModuleRef | null {
  const slash = name.indexOf('/')
  if (slash <= 0) {
    return null
  }
  let env: string
  try {
    env = decodeURIComponent(name.slice(0, slash))
  } catch {
    return null
  }
  const rest = name.slice(slash + 1)
  if (rest === 'runtime') {
    return { env, kind: 'runtime' }
  }
  if (rest.startsWith('edge.') && /^[\w.-]+$/.test(rest)) {
    return { env, kind: 'edge', key: rest.slice('edge.'.length) }
  }
  return null
}

function stripQuery(id: string): string {
  const q = id.indexOf('?')
  return q === -1 ? id : id.slice(0, q)
}

/**
 * Vite / Rolldown ids: importers import `tanstack-start-ip:<name>`, which
 * the host's `resolveId` turns into `\0tanstack-start-ip:<name>`
 * (`resolveViteEdgeModuleId`); `load` parses any form, with any query.
 */
export const viteEdgeModuleIds: EdgeModuleIds = {
  specifier: (ref) => `${EDGE_MODULE_PREFIX}${edgeModuleName(ref)}`,
  request: (key, content) =>
    viteEdgeModuleIds.specifier({ env: content.env, kind: 'edge', key }),
  parse(id) {
    let s = stripQuery(id)
    if (s.startsWith('\0')) {
      s = s.slice(1)
    } else if (s.startsWith('/@id/__x00__')) {
      s = s.slice('/@id/__x00__'.length)
    }
    if (!s.startsWith(EDGE_MODULE_PREFIX)) {
      return null
    }
    return parseEdgeModuleName(s.slice(EDGE_MODULE_PREFIX.length))
  },
}

/** Vite `resolveId`: our specifiers resolve to `\0` ids (query kept); null for anything else. */
export function resolveViteEdgeModuleId(specifier: string): string | null {
  if (viteEdgeModuleIds.parse(specifier) === null) {
    return null
  }
  if (specifier.startsWith('\0')) {
    return specifier
  }
  if (specifier.startsWith('/@id/__x00__')) {
    return `\0${specifier.slice('/@id/__x00__'.length)}`
  }
  return `\0${specifier}`
}

/** The query of an Rspack edge module request that carries its content. */
const CONTENT_QUERY = 'tss-ip='

/**
 * Rspack ids: virtual files under `dir` (e.g.
 * `<root>/node_modules/.virtual/tanstack-start/import-protection`), one
 * directory per environment; the host writes their content
 * (`ImportProtection.onEdgeModule`) before the importer's dependencies
 * resolve. The resource is the module's identity (persistent cache).
 * An importer's request carries the module's content
 * (`<file>?tss-ip=<base64url>`): an importer Rspack restores from its
 * persistent cache in a new process requests a module nothing registered,
 * which the host defines from the request before it resolves
 * (`ImportProtection.define`).
 */
export function rspackEdgeModuleIds(dir: string): EdgeModuleIds {
  const base = normalizePath(dir).replace(/\/$/, '')
  const prefix = `${base}/`
  const ids: EdgeModuleIds = {
    specifier: (ref) => `${prefix}${edgeModuleName(ref)}.mjs`,
    request: (key, content) =>
      `${ids.specifier({ env: content.env, kind: 'edge', key })}?${CONTENT_QUERY}${Buffer.from(canonicalJson(content)).toString('base64url')}`,
    content(request) {
      const ref = ids.parse(request)
      const q = request.indexOf(`?${CONTENT_QUERY}`)
      if (ref?.kind !== 'edge' || q === -1) {
        return null
      }
      let content: EdgeModuleContent
      try {
        content = JSON.parse(
          Buffer.from(
            request.slice(q + 1 + CONTENT_QUERY.length),
            'base64url',
          ).toString('utf8'),
        ) as EdgeModuleContent
      } catch {
        return null
      }
      // the key digests the content: a request whose content is not its key's is not ours
      return content.env === ref.env && edgeModuleKey(content) === ref.key
        ? content
        : null
    },
    parse(resource) {
      const s = normalizePath(stripQuery(resource))
      if (!s.startsWith(prefix) || !s.endsWith('.mjs')) {
        return null
      }
      return parseEdgeModuleName(s.slice(prefix.length, -'.mjs'.length))
    },
  }
  return ids
}

/** What an edge module needs, in either state. Plain data (part of plan facts and Rspack buildInfo). */
export interface EdgeModuleContent {
  env: string
  edgeKey: string
  /** The specifier as the importer wrote it (diagnostics). */
  specifier: string
  /** The importer, root-relative (diagnostics). */
  importer: string
  /** The denied file, root-relative, for file and marker violations (diagnostics name it). */
  file: string | null
  /** Mock export names besides `default`, sorted: the target's export names and every name the importer reads. */
  names: Array<string>
  /** The target has top-level effects: the mock carries the effect witness. */
  effectful: boolean
  /** The real module (canonical id) the allowed state re-exports; null when it did not resolve. */
  resolved: string | null
  /** The allowed state re-exports `default` too. */
  hasDefault: boolean
  /** The edge only evaluates the module (bare import): the allowed state imports it for its effects. */
  bare: boolean
  /** The rule that denied it: `allowImport` is told, even for an importer a persistent cache restored whose record is not read yet. */
  rule: RuleRef
}

/** The key of an edge module: a digest of its content, edge key included (a new content is a new module id). */
export function edgeModuleKey(content: EdgeModuleContent): string {
  return digestOf(content)
}

/** Export names a mock can declare (`export { e as "…" }` needs well-formed Unicode). */
function exportable(name: string): boolean {
  return (
    name !== 'default' &&
    name !== '*' &&
    (name as string & { isWellFormed?: () => boolean }).isWellFormed?.() !==
      false
  )
}

/** The mock state of an edge module (pure; owns its exports; the effect witness when the target is effectful). */
export function mockModuleCode(
  content: EdgeModuleContent,
  runtimeSpecifier: string,
): string {
  const meta = JSON.stringify({
    e: content.env,
    s: content.specifier,
    i: content.importer,
    ...(content.file !== null && { f: content.file }),
  })
  const lines = [
    `import { __mk, __fx } from ${stringLiteral(runtimeSpecifier, '"')};`,
    `const m = ${stringLiteral(meta, '"')};`,
  ]
  const exported: Array<string> = []
  const names = [...new Set(content.names)].filter(exportable).sort()
  names.forEach((name, i) => {
    const literal = stringLiteral(name, '"')
    lines.push(`const e${i} = /* @__PURE__ */ __mk(m, ${literal});`)
    exported.push(
      isValidIdentifier(name) ? `e${i} as ${name}` : `e${i} as ${literal}`,
    )
  })
  if (exported.length > 0) {
    lines.push(`export { ${exported.join(', ')} };`)
  }
  lines.push(`export default /* @__PURE__ */ __mk(m, "default");`)
  if (content.effectful) {
    lines.push(`__fx(m);`)
  }
  return `${lines.join('\n')}\n`
}

/** The allowed state of an edge module: the real module, transparently (side effects left to the bundler). */
export function allowedModuleCode(
  content: EdgeModuleContent,
  realSpecifier: string,
): string {
  const real = stringLiteral(realSpecifier, '"')
  if (content.bare) {
    return `import ${real};\n`
  }
  return (
    `export * from ${real};\n` +
    (content.hasDefault ? `export { default } from ${real};\n` : '')
  )
}

/**
 * The mock runtime of an environment. `__mk` creates the recursive mock
 * (reads, calls, `new`, conversions never throw; `mockAccess` reports the
 * first call, construction, conversion or write of each mocked import: a
 * renderer probing a mock, as React does a component, makes many). In
 * production (`production`: the session's `process.env.NODE_ENV`) the report
 * is one line and the runtime holds none of the longer text; the runtime
 * reads no `process` of its own.
 * `mock.foo().then(…)` runs its callback, with a mock that is not itself
 * thenable: a thenable resolving to itself makes `await` loop in microtasks,
 * freezing the tab or the whole server;
 * `__fx` is the effect witness (a call no bundler can prove pure; no
 * global, nothing logged).
 */
export function mockRuntimeCode(
  mockAccess: MockAccess,
  framework: CompileStartFrameworkOptions = 'react',
  production = false,
): string {
  const suggestions = {
    client: CLIENT_ENV_SUGGESTIONS.map((s) => `- ${s}`).join('\n'),
    server: serverEnvSuggestions(framework)
      .map((s) => `- ${s}`)
      .join('\n'),
    pattern: `- ${PATTERN_IMPORT_SUGGESTION}`,
  }
  return `const MODE = ${stringLiteral(mockAccess, '"')};
const seen = new Set();
const evaluated = [];
function report(meta, action, path) {
  if (MODE === "off") return;
  if (seen.has(meta)) return;
  seen.add(meta);
  const info = JSON.parse(meta);
  const env = info.e === "client" ? "client" : "server";
  // a module that is its own violation: no importer, the denied file (an unknown edge module has neither)
  const pattern = !info.i && info.f;
  let message = "[import-protection] Mocked import used in the " + env + " environment: " + (info.f || info.s);
  ${
    production
      ? ''
      : `{
    const SUGGESTIONS = ${JSON.stringify(suggestions)};
    message =
      "[import-protection] Mocked import used in the " + env + " environment" + (info.e !== env ? " (" + info.e + ")" : "") + "\\n\\n" +
      (pattern ? "" : "Denied import: \\"" + info.s + "\\"\\n") +
      (info.f ? "Denied file: " + info.f + "\\n" : "") +
      (pattern ? "Importer: an import the compiler does not read (a pattern import: import.meta.glob, an import() with a variable path, import.meta.webpackContext; or an import another plugin added)\\n" : info.i ? "Importer: " + info.i + "\\n" : "") +
      "Access: " + path + " (" + action + ")\\n\\n" +
      "Suggestions:\\n" + SUGGESTIONS[pattern ? "pattern" : env].split(${JSON.stringify(SPECIFIER_SLOT)}).join(info.s.replace(/[\\\\']/g, "\\\\$&")) + "\\n\\n" +
      "Further uses of this mock are not reported. To disable these runtime diagnostics, set importProtection.mockAccess: \\"off\\".";
  }`
  }
  const error = new Error(message);
  if (MODE === "warn") console.warn(error);
  else console.error(error);
}
function create(meta, name, settled) {
  const target = function () {};
  const children = Object.create(null);
  const proxy = new Proxy(target, {
    get(_target, prop) {
      if (prop === "__esModule") return true;
      if (prop === "default") return proxy;
      if (prop === "then") return settled ? undefined : (resolve, reject) => Promise.resolve(create(meta, name, true)).then(resolve, reject);
      if (prop === "catch") return () => Promise.resolve(create(meta, name, true));
      if (prop === "finally") return (f) => { if (f) f(); return Promise.resolve(create(meta, name, true)); };
      if (prop === Symbol.toPrimitive) return () => { report(meta, "toPrimitive", name); return "[import-protection mock]"; };
      if (prop === "toString" || prop === "valueOf" || prop === "toJSON")
        return () => { report(meta, String(prop), name); return "[import-protection mock]"; };
      if (typeof prop === "symbol") return undefined;
      if (!(prop in children)) children[prop] = create(meta, name + "." + prop);
      return children[prop];
    },
    apply() {
      report(meta, "call", name + "()");
      return create(meta, name + "()");
    },
    construct() {
      report(meta, "construct", "new " + name);
      return create(meta, "new " + name);
    },
    set(_target, prop) {
      report(meta, "set", name + "." + String(prop));
      return true;
    },
  });
  return proxy;
}
/* @__NO_SIDE_EFFECTS__ */
export function __mk(meta, name) {
  return create(meta, name);
}
export function __fx(meta) {
  evaluated[evaluated.length] = meta;
}
`
}
