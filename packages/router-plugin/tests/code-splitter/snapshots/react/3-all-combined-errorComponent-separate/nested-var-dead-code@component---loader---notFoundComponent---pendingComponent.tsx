import { compute, connect, loadServerData } from './lib'
if (typeof window !== 'undefined') {
  var componentOnly = compute()
}
try {
  var loaderOnly = loadServerData()
} catch {}
if (typeof window !== 'undefined') var unbraced = connect()
const SplitLoader = () => loaderOnly
export { SplitLoader as loader }
const SplitComponent = () => (
  <div>
    {componentOnly} {unbraced}
  </div>
)
export { SplitComponent as component }
