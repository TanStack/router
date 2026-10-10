import { compute, connect } from './lib'
if (typeof window !== 'undefined') {
  var componentOnly = compute()
}
try {
} catch {}
if (typeof window !== 'undefined') var unbraced = connect()
const SplitComponent = () => (
  <div>
    {componentOnly} {unbraced}
  </div>
)
export { SplitComponent as component }
