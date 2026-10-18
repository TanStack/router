/**
 * Names code may read without declaring or importing them: the globals it
 * can count on at run time. Shared by the validator of generated modules
 * (`validate-module.ts`) and the check of production client chunks
 * (`build-harness.ts`).
 *
 * Browsers define hundreds of window properties with generic names (`name`,
 * `status`, `event`, `length`, `origin`, `top`, `parent`, `close`...). A
 * compiler bug that drops a local binding with such a name leaves code that
 * reads the window property instead, and fails later or not at all. So only
 * the browser APIs code really uses count, not every name of the `globals`
 * package's browser set.
 */
import globals from 'globals'

/** Browser globals that are no Node.js global, by name. */
const browserNames = [
  'window',
  'self',
  'document',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'customElements',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'getComputedStyle',
  'getSelection',
  'matchMedia',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'postMessage',
  'reportError',
  'alert',
  'confirm',
  'prompt',
  'scrollTo',
  'scrollBy',
  'scrollX',
  'scrollY',
  'pageXOffset',
  'pageYOffset',
  'innerWidth',
  'innerHeight',
  'devicePixelRatio',
  'visualViewport',
  'isSecureContext',
  'crossOriginIsolated',
  'trustedTypes',
  'createImageBitmap',
  'Element',
  'Node',
  'NodeList',
  'NodeFilter',
  'HTMLCollection',
  'Document',
  'DocumentFragment',
  'ShadowRoot',
  'ElementInternals',
  'CustomElementRegistry',
  'DOMParser',
  'DOMRect',
  'DOMRectReadOnly',
  'DOMTokenList',
  'XMLSerializer',
  'XMLHttpRequest',
  'EventSource',
  'Worker',
  'SharedWorker',
  'MutationObserver',
  'MutationRecord',
  'IntersectionObserver',
  'IntersectionObserverEntry',
  'ResizeObserver',
  'ResizeObserverEntry',
  'FileReader',
  'FileList',
  'DataTransfer',
  'ImageData',
  'OffscreenCanvas',
  'CanvasRenderingContext2D',
  'Path2D',
  'TreeWalker',
  'NodeIterator',
  'MediaQueryList',
  'CSS',
  'CSSStyleSheet',
  'CSSStyleDeclaration',
]

/**
 * Browser constructors of whole families: elements (`HTMLDivElement`,
 * `SVGSVGElement`...) and events (`MouseEvent`, `PopStateEvent`...).
 */
const browserFamilies = /^(HTML|SVG|MathML)\w*Element$|^\w+Event$/

/** Globals a framework's own code defines for itself, which its runtime reads. */
const frameworkNames = [
  // the hydration state the script of Solid's `generateHydrationScript()`
  // creates, which `solid-js/web` reads while hydrating.
  '_$HY',
  // Vue's compile-time feature flags: a Vue build plugin defines them, and
  // without one Vue's runtime assigns them to `globalThis` before reading
  // them (`initFeatureFlags()`).
  '__VUE_OPTIONS_API__',
  '__VUE_PROD_DEVTOOLS__',
  '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__',
]

/**
 * The language's globals, those of Node.js as an ES module sees them (no
 * CommonJS wrapper variables such as `require` or `__dirname`), the browser
 * APIs above and the framework globals.
 */
export const knownGlobals: ReadonlySet<string> = new Set([
  ...Object.keys(globals.builtin),
  ...Object.keys(globals.nodeBuiltin),
  ...browserNames,
  ...Object.keys(globals.browser).filter((name) => browserFamilies.test(name)),
  ...frameworkNames,
])

/**
 * The globals browser code can count on: `knownGlobals` without the ones
 * only Node.js defines (`process`, `Buffer`, `global`, `setImmediate`,
 * `clearImmediate`). Production client builds of Vite, Rspack and webpack
 * replace `process.env.NODE_ENV` (and webpack and Rspack `global`), so a read
 * of a Node-only global that survives in a client chunk throws in a browser,
 * unless a `typeof` check guards it (see `unboundNames`).
 */
export const clientGlobals: ReadonlySet<string> = new Set(
  [...knownGlobals].filter(
    (name) =>
      name in globals.browser ||
      name in globals.builtin ||
      !(name in globals.nodeBuiltin),
  ),
)
