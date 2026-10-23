import {
  Link,
  Outlet,
  createFileRoute,
  useBlockerState,
} from '@tanstack/solid-router'

export const Route = createFileRoute('/global-blocker/_layout')({
  component: RouteComponent,
})

function RouteComponent() {
  const blocker = useBlockerState()

  return (
    <div>
      <div>
        <Link
          to="/global-blocker/single-blocker"
          activeProps={{ class: 'font-bold' }}
        >
          Single Blocker
        </Link>{' '}
        <Link
          to="/global-blocker/multi-blockers"
          activeProps={{ class: 'font-bold' }}
        >
          Multi Blockers
        </Link>
      </div>
      <div data-testid="global-blocker-status">
        global status is {blocker().status}
      </div>
      {blocker().status === 'blocked' ? (
        <div>
          <h3>Global Blocking Modal</h3>
          <div>Navigation is blocked</div>
          <div>
            <button onClick={() => blocker().proceed()}>Proceed</button>
            <button onClick={() => blocker().proceedAll()}>Proceed All</button>
            <button onClick={() => blocker().reset()}>Reset</button>
          </div>
        </div>
      ) : null}
      <Outlet />
    </div>
  )
}
