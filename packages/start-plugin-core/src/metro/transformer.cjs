'use strict'

// Metro entry point for the TanStack Start compiler.
//
// Metro loads `transformer.babelTransformerPath` synchronously via require(),
// so this file is plain CommonJS. The actual compile logic lives in the ESM
// sibling and is loaded lazily via dynamic import on the first transform call.
//
// `setup()` is called by `withTanStackStart()` (the metro.config.js helper)
// with the project root, framework, and the original transformer path so this
// wrapper can delegate post-compile.

let initialized = false
let originalTransformer = null
let implPromise = null
let compilerHandlePromise = null
let setupOptions = null

function ensureInitialized() {
  if (!initialized) {
    throw new Error(
      "[@tanstack/start-plugin-core/metro] transformer.cjs was loaded by Metro but never set up. Did you wrap your config with `withTanStackStart()`?",
    )
  }
}

function setup(options) {
  if (initialized) {
    throw new Error(
      '[@tanstack/start-plugin-core/metro] transformer.cjs setup() called twice in the same process.',
    )
  }
  if (!options || typeof options !== 'object') {
    throw new Error(
      '[@tanstack/start-plugin-core/metro] setup() requires an options object.',
    )
  }
  if (!options.root) {
    throw new Error(
      "[@tanstack/start-plugin-core/metro] setup() options.root is required (typically the project root used in metro.config.js).",
    )
  }
  if (!options.framework) {
    throw new Error(
      "[@tanstack/start-plugin-core/metro] setup() options.framework is required ('react' | 'solid' | 'vue').",
    )
  }

  const originalPath =
    options.originalTransformerPath ||
    require.resolve('@react-native/metro-babel-transformer')
  originalTransformer = require(originalPath)

  setupOptions = options
  implPromise = import('./transformer-impl.js')
  compilerHandlePromise = implPromise.then(({ createCompilerHandle }) =>
    createCompilerHandle(options),
  )
  initialized = true
}

async function transform(args) {
  ensureInitialized()
  const [{ runTransform }, compiler] = await Promise.all([
    implPromise,
    compilerHandlePromise,
  ])
  return runTransform({
    args,
    compiler,
    originalTransformer,
    options: setupOptions,
  })
}

module.exports = { setup, transform }
