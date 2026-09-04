// Run separately from timing processes: installing async_hooks changes Promise execution.
import { createHook } from 'node:async_hooks'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

globalThis.self = globalThis
const [bundle, mode = 'cached', depth = '8'] = process.argv.slice(2)
const module = await import(pathToFileURL(path.resolve(bundle)).href)
const fixture =
  mode === 'wait'
    ? module.createWaitBenchmark()
    : await module.createBenchmark(mode, Number(depth))
const drain = () => new Promise((resolve) => setImmediate(resolve))
await fixture.run(100)
await drain()
fixture.verify()
let promises = 0
let abortListeners = 0
const originalAdd = AbortSignal.prototype.addEventListener
AbortSignal.prototype.addEventListener = function (type, ...args) {
  if (type === 'abort') {
    abortListeners++
  }
  return originalAdd.call(this, type, ...args)
}
const hook = createHook({
  init(_id, type) {
    if (type === 'PROMISE') {
      promises++
    }
  },
})
hook.enable()
await fixture.run(100)
await drain()
hook.disable()
AbortSignal.prototype.addEventListener = originalAdd
fixture.verify()
fixture.dispose()
console.log(
  JSON.stringify({
    mode,
    depth: Number(depth),
    operations: 100,
    promises,
    abortListeners,
  }),
)
