'use strict'

/**
 * The webpack / Rspack loader of @tanstack/router-plugin. It is a static
 * file so that the bundler can load it by path; the implementation lives on
 * the compiler, installed by the plugin's `apply` (one per plugin instance).
 */
module.exports = function tanstackRouterLoader(source, inputMap) {
  const callback = this.async()
  const compiler = this._compiler
  const registry = compiler && compiler.__tanstackRouterCompilers
  const options = this.getOptions ? this.getOptions() : {}
  const impl = registry && registry.get(options.instance)
  if (!impl) {
    callback(null, source, inputMap)
    return
  }
  impl(this, source, inputMap).then(
    (result) => callback(null, result.code, result.map),
    (error) => callback(error),
  )
}
