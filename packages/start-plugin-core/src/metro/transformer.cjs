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

let _ready = null
let _originalTransformer = null
let _options = null
let _impl = null
let _compilerHandle = null

function readOptionsFromEnv() {
  const raw = process.env[ENV_KEY]
  if (!raw) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] transformer.cjs was loaded by Metro but ${ENV_KEY} is unset. Did you wrap your config with \`withTanStackStart()\`?`,
    )
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] could not parse ${ENV_KEY} as JSON: ${err.message}`,
    )
  }
  if (!parsed.root) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] ${ENV_KEY}.root is required.`,
    )
  }
  if (!parsed.framework) {
    throw new Error(
      `[@tanstack/start-plugin-core/metro] ${ENV_KEY}.framework is required ('react' | 'solid' | 'vue').`,
    )
  }
  return parsed
}

function init() {
  if (_ready) return _ready
  _ready = (async () => {
    _options = readOptionsFromEnv()
    const originalPath =
      _options.originalTransformerPath ||
      require.resolve('@react-native/metro-babel-transformer')
    _originalTransformer = require(originalPath)
    _impl = await import('./transformer-impl.js')
    _compilerHandle = _impl.createCompilerHandle(_options)
  })()
  return _ready
}

// Called by `withTanStackStart()` in the user's metro.config.js. Stores
// options into process.env so Metro worker processes can read them on
// first transform call.
function setup(options) {
  if (!options || typeof options !== 'object') {
    throw new Error(
      '[@tanstack/start-plugin-core/metro] setup() requires an options object.',
    )
  }
  if (!options.root) {
    throw new Error(
      "[@tanstack/start-plugin-core/metro] setup() options.root is required.",
    )
  }
  if (!options.framework) {
    throw new Error(
      "[@tanstack/start-plugin-core/metro] setup() options.framework is required.",
    )
  }
  process.env[ENV_KEY] = JSON.stringify(options)
}

async function transform(args) {
  await init()
  return _impl.runTransform({
    args,
    compiler: _compilerHandle,
    originalTransformer: _originalTransformer,
    options: _options,
  })
}

module.exports = { setup, transform }
