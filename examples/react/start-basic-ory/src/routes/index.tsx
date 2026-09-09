import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

const badges = ['File-based Routing', 'Server Functions', 'Session Auth', 'Protected Routes']

function RouteComponent() {
  return (
    <main style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.logoRow}>
          <img src="/tanstack.png" alt="TanStack" style={styles.logo} />
          <span style={styles.plus}>+</span>
          <img src="/ory.png" alt="Ory" style={styles.logo} />
        </div>

        <h1 style={styles.title}>TanStack Start + Ory Kratos</h1>
        <p style={styles.subtitle}>
          Full-stack React routing with production-grade authentication
        </p>

        <div style={styles.badges}>
          {badges.map((label) => (
            <span key={label} style={styles.badge}>{label}</span>
          ))}
        </div>

        <div style={styles.cardRow}>
          <div style={styles.card}>
            <div style={styles.cardIcon}>
              <img src="/tanstack.png" alt="" style={styles.cardLogo} />
            </div>
            <h3 style={styles.cardTitle}>TanStack Start</h3>
            <p style={styles.cardText}>
              File-based routing, server functions, and SSR — all from one
              framework. Routes in <code style={styles.code}>/src/routes/</code>{' '}
              map directly to URLs.
            </p>
          </div>

          <div style={styles.divider} />

          <div style={styles.card}>
            <div style={styles.cardIcon}>
              <img src="/ory.png" alt="" style={styles.cardLogo} />
            </div>
            <h3 style={styles.cardTitle}>Ory Kratos</h3>
            <p style={styles.cardText}>
              Headless identity management handles login, registration, and
              session lifecycle. No auth logic to maintain.
            </p>
          </div>
        </div>

        <p style={styles.footer}>
          Sign in to unlock the{' '}
          <span style={styles.highlight}>/profile</span> route, or browse the
          source to see how it's wired together.
        </p>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    margin: 0,
  },
  hero: {
    maxWidth: 760,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.75rem',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
  },
  logo: {
    width: 72,
    height: 72,
    objectFit: 'contain' as const,
  },
  plus: {
    fontSize: '2.25rem',
    fontWeight: 700,
    color: '#a78bfa',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
    fontWeight: 700,
    color: '#f1f5f9',
    textAlign: 'center' as const,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: 0,
    fontSize: '1.1rem',
    color: '#94a3b8',
    textAlign: 'center' as const,
    maxWidth: 480,
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: '0.5rem',
  },
  badge: {
    background: 'rgba(139, 92, 246, 0.15)',
    border: '1px solid rgba(139, 92, 246, 0.35)',
    color: '#c4b5fd',
    borderRadius: 20,
    padding: '0.3rem 0.85rem',
    fontSize: '0.82rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
  cardRow: {
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    background: 'rgba(30, 27, 75, 0.6)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    flex: 1,
    padding: '1.75rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.6rem',
    textAlign: 'center' as const,
  },
  cardIcon: {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLogo: {
    width: 40,
    height: 40,
    objectFit: 'contain' as const,
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  cardText: {
    margin: 0,
    fontSize: '0.88rem',
    color: '#94a3b8',
    lineHeight: 1.55,
  },
  divider: {
    width: 1,
    background: 'rgba(139, 92, 246, 0.25)',
  },
  code: {
    background: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 4,
    padding: '0.1em 0.4em',
    fontSize: '0.92em',
    color: '#c4b5fd',
  },
  footer: {
    margin: 0,
    fontSize: '0.92rem',
    color: '#64748b',
    textAlign: 'center' as const,
  },
  highlight: {
    color: '#a78bfa',
    fontWeight: 600,
  },
}
