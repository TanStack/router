import * as React from 'react'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import {
  account,
  products,
  storefront,
  team,
  orgSettings,
  personSettings,
} from '../routeScope.gen'
import type { ProductsApi } from '@route-modules/products/api'

// The router devtools, in development only.
const RouterDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      import('@tanstack/react-router-devtools').then((module) => ({
        default: module.TanStackRouterDevtools,
      })),
    )
  : () => null

export const Route = createRootRouteWithContext<{
  productsApi: ProductsApi
  onProfileMatch?: (routeId: string | undefined) => void
  profileLinks?: React.ComponentType
}>()({
  component: AppShell,
})

function AppShell() {
  const organizationProfile = orgSettings.useMatch({
    from: '@route-modules/settings:/profile',
    shouldThrow: false,
  })
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Acme Workspace home">
          <PlanMark />
          Acme <small>Workspace</small>
        </Link>
        <nav className="nav" aria-label="Main">
          <storefront.Link to="/">Shop</storefront.Link>
          <products.Link to="/">Products</products.Link>
          <account.Link to="/">Account</account.Link>
          <span className="nav-group">
            <span className="nav-label">Organizations</span>
            <team.Link to="/" params={{ orgId: 'acme' }}>
              Acme
            </team.Link>
            <team.Link to="/" params={{ orgId: 'globex' }}>
              Globex
            </team.Link>
          </span>
        </nav>
      </header>
      {/* The settings module is installed twice: switch between them, and
          watch whether the organization installation's profile matches. */}
      <nav className="subbar" aria-label="Installations">
        <span className="nav-label">Settings</span>
        <orgSettings.Link to="/profile" params={{ orgId: 'globex' }}>
          Switch to organization
        </orgSettings.Link>
        <personSettings.Link to="/profile" params={{ personId: 'ada' }}>
          Switch to person
        </personSettings.Link>
        <span className="subbar-state">
          Organization profile{' '}
          <output data-testid="organization-profile">
            {organizationProfile?.routeId ?? 'none'}
          </output>
        </span>
      </nav>
      <main className="page">
        <Outlet />
      </main>
      <React.Suspense fallback={null}>
        <RouterDevtools />
      </React.Suspense>
    </>
  )
}

/** A small floor plan: outer walls with a door, two inner walls. */
function PlanMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M7 17H1V1h16v16h-6M1 8h8M12 1v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}
