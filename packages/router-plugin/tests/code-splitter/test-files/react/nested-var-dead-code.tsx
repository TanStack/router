import { createFileRoute } from '@tanstack/react-router'
import { compute, connect, loadServerData } from './lib'

if (typeof window !== 'undefined') {
  var componentOnly = compute()
}

try {
  var loaderOnly = loadServerData()
} catch {}

if (typeof window !== 'undefined') var unbraced = connect()

export const Route = createFileRoute('/')({
  loader: () => loaderOnly,
  component: () => (
    <div>
      {componentOnly} {unbraced}
    </div>
  ),
})
