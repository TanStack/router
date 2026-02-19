import { normalizePath } from 'vite'
import * as path from 'pathe'

import { resolveViteId } from '../utils'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { isValidExportName } from './rewriteDeniedImports'
import type { ViolationInfo } from './trace'

// ---------------------------------------------------------------------------
// Virtual module ID constants
// ---------------------------------------------------------------------------

export const MOCK_MODULE_ID = 'tanstack-start-import-protection:mock'
export const RESOLVED_MOCK_MODULE_ID = resolveViteId(MOCK_MODULE_ID)

export const MOCK_EDGE_PREFIX = 'tanstack-start-import-protection:mock-edge:'
export const RESOLVED_MOCK_EDGE_PREFIX = resolveViteId(MOCK_EDGE_PREFIX)

// Dev-only runtime-diagnostic mock modules (used only by the client rewrite pass)
export const MOCK_RUNTIME_PREFIX =
  'tanstack-start-import-protection:mock-runtime:'
export const RESOLVED_MOCK_RUNTIME_PREFIX = resolveViteId(MOCK_RUNTIME_PREFIX)

export const MARKER_PREFIX = 'tanstack-start-import-protection:marker:'
export const RESOLVED_MARKER_PREFIX = resolveViteId(MARKER_PREFIX)

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

// ---------------------------------------------------------------------------
// Mock-runtime module helpers
// ---------------------------------------------------------------------------

export type MockAccessMode = 'error' | 'warn' | 'off'

function makeMockRuntimeModuleId(payload: {
  env: string
  importer: string
  specifier: string
  trace: Array<string>
  mode: MockAccessMode
}): string {
  return `${MOCK_RUNTIME_PREFIX}${toBase64Url(JSON.stringify(payload))}`
}

function stripTraceFormatting(
  trace: Array<{ file: string; line?: number; column?: number }>,
  root: string,
): Array<string> {
  // Keep this very small: runtime warning should show an actionable chain.
  // Format: relativePath[:line:col]
  const rel = (p: string) => {
    if (p.startsWith(root)) return normalizePath(path.relative(root, p))
    return p
  }
  return trace.map((s) => {
    const file = rel(s.file)
    if (s.line == null) return file
    return `${file}:${s.line}:${s.column ?? 1}`
  })
}

export function mockRuntimeModuleIdFromViolation(
  info: ViolationInfo,
  mode: MockAccessMode,
  root: string,
): string {
  if (mode === 'off') return MOCK_MODULE_ID
  // Only emit runtime diagnostics in dev and only on the client environment.
  if (info.env !== VITE_ENVIRONMENT_NAMES.client) return MOCK_MODULE_ID
  return makeMockRuntimeModuleId({
    env: info.env,
    importer: info.importer,
    specifier: info.specifier,
    trace: stripTraceFormatting(info.trace, root),
    mode,
  })
}

// ---------------------------------------------------------------------------
// Mock-edge module ID builder
// ---------------------------------------------------------------------------

export function makeMockEdgeModuleId(
  exports: Array<string>,
  source: string,
  runtimeId: string,
): string {
  const payload = {
    source,
    exports,
    runtimeId,
  }
  return `${MOCK_EDGE_PREFIX}${toBase64Url(JSON.stringify(payload))}`
}

// ---------------------------------------------------------------------------
// Load handler helpers — virtual module source code generators
// ---------------------------------------------------------------------------

export function loadSilentMockModule(): {
  syntheticNamedExports: boolean
  code: string
} {
  return {
    // syntheticNamedExports tells Rollup to derive named exports
    // from the default export. Combined with the Proxy-based mock,
    // this allows `import { anything } from 'mock'` to work.
    syntheticNamedExports: true,
    code: `
function createMock(name) {
  const fn = function () {};
  fn.prototype.name = name;
  const children = Object.create(null);
  const proxy = new Proxy(fn, {
    get(target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;
      if (prop === 'caller') return null;
      if (typeof prop === 'symbol') return undefined;
      // Thenable support: prevent await from hanging
      if (prop === 'then') return (fn) => Promise.resolve(fn(proxy));
      if (prop === 'catch') return () => Promise.resolve(proxy);
      if (prop === 'finally') return (fn) => { fn(); return Promise.resolve(proxy); };
      // Memoize child proxies so mock.foo === mock.foo
      if (!(prop in children)) {
        children[prop] = createMock(name + '.' + prop);
      }
      return children[prop];
    },
    apply() {
      return createMock(name + '()');
    },
    construct() {
      return createMock('new ' + name);
    },
  });
  return proxy;
}
const mock = createMock('mock');
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
  const names: Array<string> = Array.isArray(payload.exports)
    ? payload.exports.filter(
        (n): n is string => typeof n === 'string' && isValidExportName(n),
      )
    : []

  const runtimeId: string =
    typeof payload.runtimeId === 'string' && payload.runtimeId.length > 0
      ? payload.runtimeId
      : MOCK_MODULE_ID

  const exportLines = names.map((n) => `export const ${n} = mock.${n};`)
  return {
    code: `
 import mock from ${JSON.stringify(runtimeId)};
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

  return {
    code: `
const __meta = ${JSON.stringify(meta)};
const __mode = ${JSON.stringify(mode)};

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
    '\\n\\nFix: Remove server-only imports from client code. Use createServerFn().handler(() => ...) to call server logic from the client via RPC, or move the import into a .server.ts file. To disable these runtime diagnostics, set importProtection.mockAccess: "off".';

  const err = new Error(msg);
  if (__mode === 'warn') {
    console.warn(err);
  } else {
    console.error(err);
  }
}

function __createMock(name) {
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
      if (prop === 'finally') return (f) => { f(); return Promise.resolve(proxy); };

      // Trigger a runtime diagnostic for primitive conversions.
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
      }

      if (typeof prop === 'symbol') return undefined;
      if (!(prop in children)) {
        children[prop] = __createMock(name + '.' + prop);
      }
      return children[prop];
    },
    apply() {
      __report('call', name + '()');
      return __createMock(name + '()');
    },
    construct() {
      __report('construct', 'new ' + name);
      return __createMock('new ' + name);
    },
    set(_target, prop) {
      __report('set', name + '.' + String(prop));
      return true;
    },
  });

  return proxy;
}

const mock = __createMock('mock');
export default mock;
`,
  }
}

export function loadMarkerModule(): { code: string } {
  return { code: 'export {}' }
}
