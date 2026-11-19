// Stands for code that must never load in a browser: a database client, a
// secret, a Node API. Loading it leaves a mark that tests can look for.
declare global {
  var __SERVER_ONLY_MODULE_LOADED__: boolean | undefined
}

globalThis.__SERVER_ONLY_MODULE_LOADED__ = true

export function readSecret() {
  return 'the server secret'
}
