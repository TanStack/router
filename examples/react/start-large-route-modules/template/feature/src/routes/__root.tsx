import { Outlet } from '@tanstack/react-router'
import { Link, createModuleRoot } from '../routeScope.gen'
export type {} from '../requirements'

export const Route = createModuleRoot()({
  component: FeatureLayout,
})

function FeatureLayout() {
  return (
    <section className="module">
      <p className="module-tag">
        __MODULE_ID__ <code>{Route.fullPath}</code>
      </p>
      <h2>__TITLE__</h2>
      <nav className="module-nav" aria-label="__TITLE__">
        <Link to="/" activeOptions={{ exact: true }}>
          Items
        </Link>
        <Link to="/search" search={{ q: '', page: 1 }}>
          Search
        </Link>
        <Link to="/pages/page-0">Pages</Link>
      </nav>
      <Outlet />
    </section>
  )
}
