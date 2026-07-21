import { Link } from '@tanstack/react-router'
import type { WelcomeData } from './HomeScreen'

export function HomeScreen({ welcome }: { welcome: WelcomeData }) {
  return (
    <scrollview>
      <stacklayout style={{ padding: 24 }}>
        <label style={{ color: '#2563eb', fontWeight: '700' }}>
          ONE ROUTE TREE
        </label>
        <label style={{ fontSize: 32, fontWeight: '700', marginTop: 12 }}>
          Web and real native navigation
        </label>
        <label style={{ fontSize: 17, marginTop: 16 }}>{welcome.message}</label>
        <label style={{ color: '#64748b', marginTop: 8 }}>
          Generated at {welcome.generatedAt}
        </label>
        <Link
          to="/items/$itemId"
          params={{ itemId: 'router' }}
          style={{ marginTop: 28, padding: 16, backgroundColor: '#dbeafe' }}
        >
          Open Router
        </Link>
        <Link
          to="/items/$itemId"
          params={{ itemId: 'start' }}
          style={{ marginTop: 12, padding: 16, backgroundColor: '#dcfce7' }}
        >
          Open Start
        </Link>
        <Link
          to="/search"
          search={{ q: 'native' }}
          style={{ marginTop: 12, padding: 16, backgroundColor: '#f1f5f9' }}
        >
          Search native
        </Link>
      </stacklayout>
    </scrollview>
  )
}
