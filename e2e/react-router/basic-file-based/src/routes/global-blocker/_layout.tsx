import {
  Outlet,
  createFileRoute,
  useNavigationBlockingState,
} from '@tanstack/react-router'

export const Route = createFileRoute('/global-blocker/_layout')({
  component: RouteComponent,
})

function RouteComponent() {
  const { proceed, reset, status, proceedAll } = useNavigationBlockingState()

  return (
    <div>
      {status === 'blocked' ? (
        <div
          style={{
            marginLeft: 'auto',
            paddingRight: '240px',
            position: 'fixed',
            border: '1px solid black',
            width: '600px',
            height: '600px',
            left: '50px',
            bottom: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '20px',
            color: 'white',
            borderRadius: '10px',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)',
            zIndex: 1000,
            backgroundColor: 'saddlebrown',
          }}
        >
          <h3>Global Blocking Modal</h3>
          <div>Navigation is blocked</div>
          <div className="flex gap-2 flex-col">
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
