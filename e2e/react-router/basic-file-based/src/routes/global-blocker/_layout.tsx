import {
  Link,
  Outlet,
  createFileRoute,
  useBlockerState,
} from '@tanstack/react-router'

export const Route = createFileRoute('/global-blocker/_layout')({
  component: RouteComponent,
})

function RouteComponent() {
  const { proceed, reset, status, proceedAll } = useBlockerState()

  return (
    <div>
      <div>
        <Link
          to="/global-blocker/single-blocker"
          activeProps={{ className: 'font-bold' }}
        >
          Single Blocker
        </Link>{' '}
        <Link
          to="/global-blocker/multi-blockers"
          activeProps={{ className: 'font-bold' }}
        >
          Multi Blockers
        </Link>
      </div>
      <div data-testid="global-blocker-status">global status is {status}</div>
      {status === 'blocked' ? (
        <div>
          <h3>Global Blocking Modal</h3>
          <div>Navigation is blocked</div>
          <div>
            <button onClick={proceed}>Proceed</button>
            <button onClick={proceedAll}>Proceed All</button>
            <button onClick={reset}>Reset</button>
          </div>
        </div>
      ) : null}
      <Outlet />
    </div>
  )
}
