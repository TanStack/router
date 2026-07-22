import { Link } from '@tanstack/react-router'

export interface CatalogResult {
  name: string
  description: string
}

export function SearchScreen({
  query,
  results,
}: {
  query: string
  results: Array<CatalogResult>
}) {
  return (
    <section className="panel">
      <p className="eyebrow">SEARCH PARAMS + SERVER FUNCTION</p>
      <h1>Results for “{query}”</h1>
      {results.map((result) => (
        <article key={result.name}>
          <h2>{result.name}</h2>
          <p>{result.description}</p>
        </article>
      ))}
      <div className="actions">
        <Link to="/search" search={{ q: 'router' }}>
          Router
        </Link>
        <Link to="/search" search={{ q: 'start' }}>
          Start
        </Link>
      </div>
    </section>
  )
}
