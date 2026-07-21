import { Link } from '@tanstack/react-router'
import type { CatalogResult } from './SearchScreen'

export function SearchScreen({
  query,
  results,
}: {
  query: string
  results: Array<CatalogResult>
}) {
  return (
    <scrollview>
      <stacklayout style={{ padding: 24 }}>
        <label style={{ color: '#2563eb', fontWeight: '700' }}>
          SEARCH PARAMS + SERVER FUNCTION
        </label>
        <label style={{ fontSize: 28, fontWeight: '700', marginTop: 12 }}>
          Results for “{query}”
        </label>
        {results.map((result) => (
          <stacklayout
            key={result.name}
            style={{ padding: 16, marginTop: 16, backgroundColor: '#f1f5f9' }}
          >
            <label style={{ fontSize: 20, fontWeight: '700' }}>
              {result.name}
            </label>
            <label style={{ marginTop: 6 }}>{result.description}</label>
          </stacklayout>
        ))}
        <Link
          to="/search"
          search={{ q: 'router' }}
          style={{ marginTop: 24, padding: 16, backgroundColor: '#dbeafe' }}
        >
          Search Router
        </Link>
        <Link
          to="/search"
          search={{ q: 'start' }}
          style={{ marginTop: 12, padding: 16, backgroundColor: '#dcfce7' }}
        >
          Search Start
        </Link>
      </stacklayout>
    </scrollview>
  )
}
