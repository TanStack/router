import { useLoaderInstance } from '@tanstack/react-loaders'

export default function DashboardHome() {
  const invoicesLoaderInstance = useLoaderInstance({ key: 'invoices' })
  const invoices = invoicesLoaderInstance.state.data

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}
