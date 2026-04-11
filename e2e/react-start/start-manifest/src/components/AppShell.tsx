import { ClientOnly, Link, Outlet, linkOptions } from '@tanstack/react-router'
import styles from '~/styles/root-shell.module.css'

const ROUTES = linkOptions([
  { to: '/', label: 'home' },
  { to: '/r1', label: '/r1' },
  { to: '/r2', label: '/r2' },
  { to: '/shared-a', label: '/shared-a' },
])

export function AppShell() {
  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        {ROUTES.map((route) => (
          <Link key={route.to} {...route} data-testid={`nav-${route.label}`}>
            {route.label}
          </Link>
        ))}
      </nav>

      <main className={styles.content}>
        <div className={styles.rootBadge} data-testid="root-shell-marker">
          Start manifest CSS root shell
        </div>
        <ClientOnly>
          <div data-testid="hydration-marker">hydrated</div>
        </ClientOnly>
        <Outlet />
      </main>
    </div>
  )
}
