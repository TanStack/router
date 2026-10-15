// Node's own `import()`, outside Vitest's module runner, so that the module
// hooks of `module-linker.ts` resolve and load the modules it imports.
/** @param {string} specifier */
module.exports = (specifier) => import(specifier)
