import * as React from 'react'
import {
  Link,
  Outlet,
  createRootRoute,
  useNavigationBlockingState,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const { proceed, reset, status, proceedAll } = useNavigationBlockingState()

  return (
    <>
      <div className="p-2 flex gap-2 text-lg">
        <Link
          to="/"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          <button style={{ border: '1px solid white', padding: '8px' }}>
            Non blocking page
          </button>
        </Link>

        <Link
          to="/blocking"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          <button style={{ border: '1px solid white', padding: '8px' }}>
            Blocking page
          </button>
        </Link>

        <Link
          to="/multi-blockers"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          <button style={{ border: '1px solid white', padding: '8px' }}>
            Multi blockers page
          </button>
        </Link>

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
            This modal rendered from __root.tsx, but blocking comes from
            blocking.index.tsx
            <button onClick={proceed}>Proceed</button>
            <button onClick={proceedAll}>Proceed All</button>
            <button onClick={reset}>Reset</button>
          </div>
        ) : (
          <div
            style={{
              marginLeft: 'auto',
              paddingRight: '240px',
              position: 'fixed',
              border: '1px solid black',
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
              padding: '16px',
            }}
          >
            Router not blocking
          </div>
        )}
      </div>
      <hr />
      <Outlet />

      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
