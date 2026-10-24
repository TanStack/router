// @ts-nocheck (a plain loader file Rspack loads with Node)
// The Rspack loader of the import-protection witness tests: hands the module
// to the test's host (registered on `globalThis` by app root, since Rspack
// loads this file outside the test's module graph).
const HOSTS = Symbol.for('tanstack.start.ip.witness-hosts')

export default function importProtectionTestLoader(code, map) {
  const callback = this.async()
  const hosts = globalThis[HOSTS]
  const resource = this.resource
  let host
  for (const [root, h] of hosts ?? []) {
    if (resource.startsWith(root + '/')) {
      host = h
    }
  }
  if (!host) {
    callback(null, code, map)
    return
  }
  host(this, code).then(
    (out) => (out === null ? callback(null, code, map) : callback(null, out)),
    (error) => callback(error),
  )
}
