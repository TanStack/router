'use strict'

// Metro entry point for the TanStack Start compiler.
//
// Metro loads `transformer.babelTransformerPath` synchronously via require()
// in EACH worker process. That means module-level state set by `setup()`
// in the main process doesn't propagate to workers. We pass options
// through `process.env.TSR_START_METRO_OPTIONS` (a JSON string) which IS
// inherited by Metro's jest-worker children. `setup()` writes it; this
// transformer reads it lazily on the first transform call.
//
// The actual compile logic lives in the ESM sibling and is loaded via
// dynamic import on first call.

const ENV_KEY = 'TSR_START_METRO_OPTIONS'

/**
 * @typedef {import('./transformer-impl.js').TransformerImplOptions} TransformerOptions
 * @typedef {ReturnType<typeof import('./transformer-impl.js')['createCompilerHandle']>} MetroCompilerHandle
 * @typedef {{
 *   filename: string
 *   src: string
 *   options?: Record<string, unknown>
 *   plugins?: Array<unknown>
 * }} TransformArgs
 * @typedef {{ transform: (args: TransformArgs) => Promise<unknown> | unknown }} OriginalTransformer
 * @typedef {{
 *   createCompilerHandle: (options: TransformerOptions) => MetroCompilerHandle
 *   runTransform: (input: {
 *     args: TransformArgs
 *     compiler: MetroCompilerHandle
 *     originalTransformer: OriginalTransformer
 *     options: TransformerOptions
 *   }) => Promise<unknown>
 * }} TransformerImpl
 */

/** @type {Promise<void> | null} */
let _ready = null
/** @type {OriginalTransformer | null} */
let _originalTransformer = null
/** @type {TransformerOptions | null} */
let _options = null
/** @type {TransformerImpl | null} */
let _impl = null
/** @type {MetroCompilerHandle | null} */
let _compilerHandle = null

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object'
}

/** @returns {TransformerOptions} */
function readOptionsFromEnv() {
  const raw = process.env[ENV_KEY]
  if (!raw) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] transformer.cjs was loaded by Metro but ${ENV_KEY} is unset. Did you wrap your config with \`withTanStackStart()\`?`,
    )
  }
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[@tanstack/start-plugin-core/metro] could not parse ${ENV_KEY} as JSON: ${message}`,
    )
  }
  if (!isRecord(parsed)) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] ${ENV_KEY} must be a JSON object.`,
    )
  }
  if (typeof parsed.root !== 'string' || !parsed.root) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] ${ENV_KEY}.root is required.`,
    )
  }
  if (
    parsed.framework !== 'react' &&
    parsed.framework !== 'solid' &&
    parsed.framework !== 'vue'
  ) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] ${ENV_KEY}.framework is required ('react' | 'solid' | 'vue').`,
    )
  }
  return /** @type {TransformerOptions} */ (/** @type {unknown} */ (parsed))
}

/** @returns {Promise<void>} */
function init() {
  if (_ready) return _ready
  _ready = (async () => {
    const options = readOptionsFromEnv()
    _options = options
    const originalPath =
      options.originalTransformerPath ||
      require.resolve('@react-native/metro-babel-transformer')
    _originalTransformer = /** @type {OriginalTransformer} */ (
      require(originalPath)
    )
    _impl = /** @type {TransformerImpl} */ (
      await import('./transformer-impl.js')
    )
    _compilerHandle = _impl.createCompilerHandle(options)
  })()
  return _ready
}

// Called by `withTanStackStart()` in the user's metro.config.js. Stores
// options into process.env so Metro worker processes can read them on
// first transform call.
/** @param {Partial<TransformerOptions> | null | undefined} options */
function setup(options) {
  if (!options || typeof options !== 'object') {
    throw new Error(
      '[@tanstack/start-plugin-core/metro] setup() requires an options object.',
    )
  }
  if (!options.root) {
    throw new Error(
      '[@tanstack/start-plugin-core/metro] setup() options.root is required.',
    )
  }
  if (!options.framework) {
    throw new Error(
      '[@tanstack/start-plugin-core/metro] setup() options.framework is required.',
    )
  }
  process.env[ENV_KEY] = JSON.stringify(options)
}

/** @param {TransformArgs} args */
async function transform(args) {
  await init()
  const impl = _impl
  const compilerHandle = _compilerHandle
  const originalTransformer = _originalTransformer
  const options = _options

  if (!impl || !compilerHandle || !originalTransformer || !options) {
    throw new Error(
      '[@tanstack/start-plugin-core/metro] transformer failed to initialize.',
    )
  }

  return impl.runTransform({
    args,
    compiler: compilerHandle,
    originalTransformer,
    options,
  })
}

module.exports = { setup, transform }
