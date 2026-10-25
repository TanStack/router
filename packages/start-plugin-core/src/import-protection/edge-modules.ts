/**
 * Edge modules (DESIGN §3.14.3; R30, J6.3, J6.8): the per-edge module a
 * violating import is substituted with, its two states, the mock runtime of
 * an environment, and the ids hosts serve them under.
 *
 * - `mock`: a pure module that owns its exports (string export names: any
 *   spelling), each a `/* @__PURE__ *\/` mock creation, plus one `__fx(…)`
 *   call (the effect witness) when the denied target has top-level effects.
 *   It is the survival witness in builds (R30): bundlers keep an owned
 *   export only where the importer's binding survives, and keep `__fx` only
 *   where the importer is evaluated.
 * - `allowed` (a build veto, `onViolation` → false): a transparent
 *   re-export of the real module, side effects left to the bundler.
 * - the runtime (one per environment, side-effect free): the recursive
 *   mock Proxy with the `mockAccess` diagnostics, in every environment and
 *   mode (J6.3).
 */
import {
  canonicalJson,
  digestOf,
  isValidIdentifier,
  stringLiteral,
} from '@tanstack/router-utils/compiler'
import { CLIENT_ENV_SUGGESTIONS, SERVER_ENV_SUGGESTIONS } from './trace'
import type { MockAccess } from './config'

export const EDGE_MODULE_PREFIX = 'tanstack-start-ip:'

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
export function edgeModuleName(ref: EdgeModuleRef): string {
  const env = encodeURIComponent(ref.env)
  return ref.kind === 'edge' ? `${env}/edge.${ref.key}` : `${env}/runtime`
}

export function parseEdgeModuleName(name: string): EdgeModuleRef | null {
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
  const base = dir.replace(/\\/g, '/').replace(/\/$/, '')
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
      const s = stripQuery(resource).replace(/\\/g, '/')
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
}

/** The key of an edge module: its edge key and a hash of its content (a new content is a new module id). */
export function edgeModuleKey(content: EdgeModuleContent): string {
  return `${content.edgeKey}.${digestOf(content).slice(0, 10)}`
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
 * (reads, calls, `new`, conversions never throw; `mockAccess` reports a
 * call, a construction, a conversion or a write once per access path);
 * `__fx` is the effect witness (a call no bundler can prove pure; no
 * global, nothing logged).
 */
export function mockRuntimeCode(mockAccess: MockAccess): string {
  const suggestions = {
    client: `Fix: ${CLIENT_ENV_SUGGESTIONS.join('. ')}.`,
    server: `Fix: ${SERVER_ENV_SUGGESTIONS.join('. ')}.`,
  }
  return `const MODE = ${stringLiteral(mockAccess, '"')};
const SUGGESTIONS = ${JSON.stringify(suggestions)};
const seen = new Set();
const evaluated = [];
function report(meta, action, path) {
  if (MODE === "off") return;
  const key = meta + "\\u0000" + action + "\\u0000" + path;
  if (seen.has(key)) return;
  seen.add(key);
  let info = {};
  try { info = JSON.parse(meta); } catch {}
  const message =
    "[import-protection] Mocked import used in the " + info.e + " environment\\n\\n" +
    "Denied import: \\"" + info.s + "\\"\\n" +
    (info.f ? "Denied file: " + info.f + "\\n" : "") +
    "Importer: " + info.i + "\\n" +
    "Access: " + path + " (" + action + ")\\n\\n" +
    (info.e === "client" ? SUGGESTIONS.client : SUGGESTIONS.server) +
    " To disable these runtime diagnostics, set importProtection.mockAccess: \\"off\\".";
  const error = new Error(message);
  if (MODE === "warn") console.warn(error);
  else console.error(error);
}
function create(meta, name) {
  const target = function () {};
  const children = Object.create(null);
  const proxy = new Proxy(target, {
    get(_target, prop) {
      if (prop === "__esModule") return true;
      if (prop === "default") return proxy;
      if (prop === "then") return (resolve) => Promise.resolve(resolve ? resolve(proxy) : proxy);
      if (prop === "catch") return () => Promise.resolve(proxy);
      if (prop === "finally") return (f) => { if (f) f(); return Promise.resolve(proxy); };
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
