import { resolveViteId } from '../utils'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { isValidExportName } from './rewriteDeniedImports'
import { CLIENT_ENV_SUGGESTIONS } from './trace'
import { VITE_BROWSER_VIRTUAL_PREFIX } from './constants'
import { relativizePath } from './utils'
import type { ViolationInfo } from './trace'

export const MOCK_MODULE_ID = 'tanstack-start-import-protection:mock'
const RESOLVED_MOCK_MODULE_ID = resolveViteId(MOCK_MODULE_ID)

/**
 * Per-violation mock prefix used in build+error mode.
 * Each deferred violation gets a unique ID so we can check which ones
 * survived tree-shaking in `generateBundle`.
 */
export const MOCK_BUILD_PREFIX = 'tanstack-start-import-protection:mock:build:'
const RESOLVED_MOCK_BUILD_PREFIX = resolveViteId(MOCK_BUILD_PREFIX)

export const MOCK_EDGE_PREFIX = 'tanstack-start-import-protection:mock-edge:'
const RESOLVED_MOCK_EDGE_PREFIX = resolveViteId(MOCK_EDGE_PREFIX)

export const MOCK_RUNTIME_PREFIX =
  'tanstack-start-import-protection:mock-runtime:'
const RESOLVED_MOCK_RUNTIME_PREFIX = resolveViteId(MOCK_RUNTIME_PREFIX)

const MARKER_PREFIX = 'tanstack-start-import-protection:marker:'
const RESOLVED_MARKER_PREFIX = resolveViteId(MARKER_PREFIX)

const RESOLVED_MARKER_SERVER_ONLY = resolveViteId(`${MARKER_PREFIX}server-only`)
const RESOLVED_MARKER_CLIENT_ONLY = resolveViteId(`${MARKER_PREFIX}client-only`)

export function resolvedMarkerVirtualModuleId(
  kind: 'server' | 'client',
): string {
  return kind === 'server'
    ? RESOLVED_MARKER_SERVER_ONLY
    : RESOLVED_MARKER_CLIENT_ONLY
}

/**
 * Convenience list for plugin `load` filters/handlers.
 *
 * Vite/Rollup call `load(id)` with the *resolved* virtual id (prefixed by `\0`).
 * `resolveId(source)` sees the *unresolved* id/prefix (without `\0`).
 */
export function getResolvedVirtualModuleMatchers(): ReadonlyArray<string> {
  return RESOLVED_VIRTUAL_MODULE_MATCHERS
}

const RESOLVED_VIRTUAL_MODULE_MATCHERS = [
  RESOLVED_MOCK_MODULE_ID,
  RESOLVED_MOCK_BUILD_PREFIX,
  RESOLVED_MOCK_EDGE_PREFIX,
  RESOLVED_MOCK_RUNTIME_PREFIX,
  RESOLVED_MARKER_PREFIX,
] as const

const RESOLVE_PREFIX_PAIRS = [
  [MOCK_EDGE_PREFIX, RESOLVED_MOCK_EDGE_PREFIX],
  [MOCK_RUNTIME_PREFIX, RESOLVED_MOCK_RUNTIME_PREFIX],
  [MOCK_BUILD_PREFIX, RESOLVED_MOCK_BUILD_PREFIX],
  [MARKER_PREFIX, RESOLVED_MARKER_PREFIX],
] as const

/**
 * Resolve import-protection's internal virtual module IDs.
 *
 * `resolveId(source)` sees *unresolved* ids/prefixes (no `\0`).
 * Returning a resolved id (with `\0`) ensures Vite/Rollup route it to `load`.
 */
export function resolveInternalVirtualModuleId(
  source: string,
): string | undefined {
  if (source.startsWith(VITE_BROWSER_VIRTUAL_PREFIX)) {
    return resolveInternalVirtualModuleId(
      `\0${source.slice(VITE_BROWSER_VIRTUAL_PREFIX.length)}`,
    )
  }

  if (source === MOCK_MODULE_ID || source === RESOLVED_MOCK_MODULE_ID) {
    return RESOLVED_MOCK_MODULE_ID
  }

  for (const [unresolvedPrefix, resolvedPrefix] of RESOLVE_PREFIX_PAIRS) {
    if (source.startsWith(unresolvedPrefix)) {
      return resolveViteId(source)
    }

    if (source.startsWith(resolvedPrefix)) {
      return source
    }
  }

  return undefined
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

type MockAccessMode = 'error' | 'warn' | 'off'

/**
 * Compact runtime suggestion text for browser console, derived from
 * {@link CLIENT_ENV_SUGGESTIONS} so there's a single source of truth.
 */
export const RUNTIME_SUGGESTION_TEXT =
  'Fix: ' +
  CLIENT_ENV_SUGGESTIONS.join('. ') +
  '. To disable these runtime diagnostics, set importProtection.mockAccess: "off".'

export function mockRuntimeModuleIdFromViolation(
  info: ViolationInfo,
  mode: MockAccessMode,
  root: string,
): string {
  if (mode === 'off') return MOCK_MODULE_ID
  if (info.env !== VITE_ENVIRONMENT_NAMES.client) return MOCK_MODULE_ID

  const rel = (p: string) => relativizePath(p, root)
  const trace = info.trace.map((s) => {
    const file = rel(s.file)
    if (s.line == null) return file
    return `${file}:${s.line}:${s.column ?? 1}`
  })

  const payload = {
    env: info.env,
    importer: info.importer,
    specifier: info.specifier,
    trace,
    mode,
  }
  return `${MOCK_RUNTIME_PREFIX}${toBase64Url(JSON.stringify(payload))}`
}

export function makeMockEdgeModuleId(
  exports: Array<string>,
  runtimeId: string,
): string {
  const payload = { exports, runtimeId }
  return `${MOCK_EDGE_PREFIX}${toBase64Url(JSON.stringify(payload))}`
}

/**
 * Generate a recursive Proxy-based mock module.
 *
 * When `diagnostics` is provided, the generated code includes a `__report`
 * function that logs runtime warnings/errors when the mock is actually used
 * (property access for primitive coercion, calls, construction, sets).
 *
 * When `diagnostics` is omitted, the mock is completely silent — suitable
 * for base mock modules (e.g. `MOCK_MODULE_ID` or per-violation build mocks)
 * that are consumed by mock-edge modules providing explicit named exports.
 */
function generateMockCode(diagnostics?: {
  meta: {
    env: string
    importer: string
    specifier: string
    trace: Array<unknown>
  }
  mode: 'error' | 'warn' | 'off'
}): string {
  const fnName = diagnostics ? '__createMock' : 'createMock'
  const hasDiag = !!diagnostics

  const preamble = hasDiag
    ? `const __meta = ${JSON.stringify(diagnostics.meta)};
const __mode = ${JSON.stringify(diagnostics.mode)};

const __seen = new Set();
function __report(action, accessPath) {
  if (__mode === 'off') return;
  const key = action + ':' + accessPath;
  if (__seen.has(key)) return;
  __seen.add(key);

  const traceLines = Array.isArray(__meta.trace) && __meta.trace.length
    ? "\\n\\nTrace:\\n" + __meta.trace.map((t, i) => '  ' + (i + 1) + '. ' + String(t)).join('\\n')
    : '';

  const msg =
    '[import-protection] Mocked import used in dev client\\n\\n' +
    'Denied import: "' + __meta.specifier + '"\\n' +
    'Importer: ' + __meta.importer + '\\n' +
    'Access: ' + accessPath + ' (' + action + ')' +
    traceLines +
    '\\n\\n' + ${JSON.stringify(RUNTIME_SUGGESTION_TEXT)};

  const err = new Error(msg);
  if (__mode === 'warn') {
    console.warn(err);
  } else {
    console.error(err);
  }
}
`
    : ''

  // Diagnostic-only traps for primitive coercion, set
  const diagGetTraps = hasDiag
    ? `
      if (prop === Symbol.toPrimitive) {
        return () => {
          __report('toPrimitive', name);
          return '[import-protection mock]';
        };
      }
      if (prop === 'toString' || prop === 'valueOf' || prop === 'toJSON') {
        return () => {
          __report(String(prop), name);
          return '[import-protection mock]';
        };
      }`
    : ''

  const applyBody = hasDiag
    ? `__report('call', name + '()');
      return ${fnName}(name + '()');`
    : `return ${fnName}(name + '()');`

  const constructBody = hasDiag
    ? `__report('construct', 'new ' + name);
      return ${fnName}('new ' + name);`
    : `return ${fnName}('new ' + name);`

  const setTrap = hasDiag
    ? `
    set(_target, prop) {
      __report('set', name + '.' + String(prop));
      return true;
    },`
    : ''

  return `
${preamble}/* @__NO_SIDE_EFFECTS__ */
function ${fnName}(name) {
  const fn = function () {};
  fn.prototype.name = name;
  const children = Object.create(null);
  const proxy = new Proxy(fn, {
    get(_target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;
      if (prop === 'caller') return null;
      if (prop === 'then') return (f) => Promise.resolve(f(proxy));
      if (prop === 'catch') return () => Promise.resolve(proxy);
      if (prop === 'finally') return (f) => { f(); return Promise.resolve(proxy); };${diagGetTraps}
      if (typeof prop === 'symbol') return undefined;
      if (!(prop in children)) {
        children[prop] = ${fnName}(name + '.' + prop);
      }
      return children[prop];
    },
    apply() {
      ${applyBody}
    },
    construct() {
      ${constructBody}
    },${setTrap}
  });
  return proxy;
}
const mock = /* @__PURE__ */ ${fnName}('mock');
export default mock;
`
}

export function loadSilentMockModule(): { code: string } {
  return { code: generateMockCode() }
}

/**
 * Filter export names to valid, non-default names.
 */
function filterExportNames(exports: ReadonlyArray<string>): Array<string> {
  return exports.filter((n) => n.length > 0 && n !== 'default')
}

/**
 * Generate ESM export lines that re-export named properties from `mock`.
 *
 * Produces `export const foo = mock.foo;` for valid identifiers and
 * string-keyed re-exports for non-identifier names.
 */
function generateExportLines(names: ReadonlyArray<string>): Array<string> {
  const lines: Array<string> = []
  const stringExports: Array<{ alias: string; name: string }> = []

  for (let i = 0; i < names.length; i++) {
    const n = names[i]!
    if (isValidExportName(n)) {
      lines.push(`export const ${n} = mock.${n};`)
    } else {
      const alias = `__tss_str_${i}`
      lines.push(`const ${alias} = mock[${JSON.stringify(n)}];`)
      stringExports.push({ alias, name: n })
    }
  }

  if (stringExports.length > 0) {
    const reexports = stringExports
      .map((s) => `${s.alias} as ${JSON.stringify(s.name)}`)
      .join(', ')
    lines.push(`export { ${reexports} };`)
  }

  return lines
}

/**
 * Generate a self-contained mock module with explicit named exports.
 *
 * Used by the transform hook's "self-denial" check: when a denied file
 * (e.g. `.server.ts` in the client environment) is transformed, its entire
 * content is replaced with this mock module.  This avoids returning virtual
 * module IDs from `resolveId`, which prevents cross-environment cache
 * contamination from third-party resolver plugins.
 *
 * The generated code is side-effect-free and tree-shakeable.
 */
export function generateSelfContainedMockModule(exportNames: Array<string>): {
  code: string
} {
  const mockCode = generateMockCode()
  const exportLines = generateExportLines(filterExportNames(exportNames))

  return {
    code: `${mockCode}
${exportLines.join('\n')}
`,
  }
}

/**
 * Generate a dev-mode mock module for self-denial transforms.
 *
 * Similar to `loadMockEdgeModule` but takes export names and a runtime ID
 * directly (instead of parsing them from a base64url-encoded payload).
 * Used by the transform hook when a denied file (e.g. `.server.ts` in
 * the client environment) is replaced in dev mode.
 *
 * The generated module imports mock-runtime for runtime diagnostics
 * (error/warn on property access) and re-exports explicit named exports
 * so that `import { foo } from './denied.server'` works.
 */
export function generateDevSelfDenialModule(
  exportNames: Array<string>,
  runtimeId: string,
): { code: string } {
  const names = filterExportNames(exportNames)
  const exportLines = generateExportLines(names)

  return {
    code: `import mock from ${JSON.stringify(runtimeId)};
${exportLines.join('\n')}
export default mock;
`,
  }
}

export function loadMockEdgeModule(encodedPayload: string): { code: string } {
  let payload: { exports?: Array<string>; runtimeId?: string }
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as typeof payload
  } catch {
    payload = { exports: [] }
  }
  const names = filterExportNames(payload.exports ?? [])

  const runtimeId: string =
    typeof payload.runtimeId === 'string' && payload.runtimeId.length > 0
      ? payload.runtimeId
      : MOCK_MODULE_ID

  const exportLines = generateExportLines(names)

  return {
    code: `import mock from ${JSON.stringify(runtimeId)};
${exportLines.join('\n')}
export default mock;
`,
  }
}

export function loadMockRuntimeModule(encodedPayload: string): {
  code: string
} {
  let payload: {
    mode?: string
    env?: string
    importer?: string
    specifier?: string
    trace?: Array<unknown>
  }
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as typeof payload
  } catch {
    payload = {}
  }

  const mode: 'error' | 'warn' | 'off' =
    payload.mode === 'warn' || payload.mode === 'off' ? payload.mode : 'error'

  const meta = {
    env: String(payload.env ?? ''),
    importer: String(payload.importer ?? ''),
    specifier: String(payload.specifier ?? ''),
    trace: Array.isArray(payload.trace) ? payload.trace : [],
  }

  return { code: generateMockCode({ meta, mode }) }
}

const MARKER_MODULE_RESULT = { code: 'export {}' } as const

export function loadMarkerModule(): { code: string } {
  return MARKER_MODULE_RESULT
}

export function loadResolvedVirtualModule(
  id: string,
): { code: string } | undefined {
  if (id === RESOLVED_MOCK_MODULE_ID) {
    return loadSilentMockModule()
  }

  // Per-violation build mock modules — same silent mock code
  if (id.startsWith(RESOLVED_MOCK_BUILD_PREFIX)) {
    return loadSilentMockModule()
  }

  if (id.startsWith(RESOLVED_MOCK_EDGE_PREFIX)) {
    return loadMockEdgeModule(id.slice(RESOLVED_MOCK_EDGE_PREFIX.length))
  }

  if (id.startsWith(RESOLVED_MOCK_RUNTIME_PREFIX)) {
    return loadMockRuntimeModule(id.slice(RESOLVED_MOCK_RUNTIME_PREFIX.length))
  }

  if (id.startsWith(RESOLVED_MARKER_PREFIX)) {
    return loadMarkerModule()
  }

  return undefined
}
