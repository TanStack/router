import { Outlet, Link, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanstackDevtools } from '@tanstack/react-devtools'
import { ResponsiveImage } from '@responsive-image/react'
import './app.css'
import { getThumbsnails } from '../images.ts'

export const Route = createRootRoute({
  component: App,
})

function App() {
  return (
    <>
      <div className="wrapper">
        <aside>
          {Object.entries(getThumbsnails()).map(([imageId, image]) => (
            <Link to="/$imageId" params={{ imageId }} key={imageId}>
              <ResponsiveImage src={image} width={200}></ResponsiveImage>
            </Link>
          ))}
        </aside>
        <main>
          <Outlet />
        </main>
      </div>
      <TanstackDevtools
        config={{
          position: 'bottom-left',
        }}
        plugins={[
          {
            name: 'Tanstack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </>
  )
}
