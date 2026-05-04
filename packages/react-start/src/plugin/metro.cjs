'use strict'

// CJS shim for `@tanstack/react-start/plugin/metro`.
//
// `metro.config.js` is conventionally CJS, but `@tanstack/react-start` ships
// as ESM. This shim lets users `require()` it in their metro.config.js by
// dynamically importing the ESM build on first call. `withTanStackStart`
// already returns a Promise and Metro accepts Promise-typed configs, so the
// extra `await import()` is invisible at the call site.

let modulePromise = null

function loadModule() {
  if (!modulePromise) {
    modulePromise = import('./metro.js')
  }
  return modulePromise
}

async function withTanStackStart(metroConfig, options) {
  const mod = await loadModule()
  return mod.withTanStackStart(metroConfig, options)
}

module.exports = { withTanStackStart }
