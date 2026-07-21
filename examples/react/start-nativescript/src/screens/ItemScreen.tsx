import { Link } from '@tanstack/react-router'
import type { CatalogResult } from './SearchScreen'

export interface ItemScreenProps {
  item: CatalogResult
  backProtected: boolean
  onBackProtectedChange: (protectedBack: boolean) => void
}

export function ItemScreen({
  item,
  backProtected,
  onBackProtectedChange,
}: ItemScreenProps) {
  return (
    <section className="panel">
      <p className="eyebrow">PATH PARAM + NATIVE STACK</p>
      <h1>{item.name}</h1>
      <p>{item.description}</p>
      {backProtected ? <p>Back protected</p> : null}
      <div className="actions">
        <Link to="/search" search={{ q: item.name }}>
          Search this topic
        </Link>
        <button
          type="button"
          onClick={() => onBackProtectedChange(!backProtected)}
        >
          {backProtected ? 'Allow back' : 'Protect back'}
        </button>
      </div>
    </section>
  )
}
