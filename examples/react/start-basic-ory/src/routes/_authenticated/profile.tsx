import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/profile')({
  component: RouteComponent,
})

function RouteComponent() {
  const { auth } = Route.useRouteContext()
  const email = auth.session?.identity?.traits?.email

  return (
    <main style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '5rem', padding: '5rem 2rem 0' }}>
      <div style={{ background: 'rgba(30, 27, 75, 0.6)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 16, padding: '2.5rem 3rem', textAlign: 'center' as const, maxWidth: 400, width: '100%' }}>
        <h1 style={{ margin: '0 0 1.5rem', color: '#f1f5f9', fontSize: '1.75rem', fontWeight: 700 }}>Profile</h1>
        <p style={{ margin: '0 0 0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>Signed in as</p>
        <p style={{ margin: 0, color: '#c4b5fd', fontSize: '1.1rem', fontWeight: 600 }}>{email ?? '—'}</p>
      </div>
    </main>
  )
}
