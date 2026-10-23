// Node's own `import()`, outside Vitest's module runner: a built server
// bundle then loads its own chunks as Node does (start-plugin-core
// `tests/integration/start-compose-app.ts`).
/** @param {string} specifier */
module.exports = (specifier) => import(specifier)
