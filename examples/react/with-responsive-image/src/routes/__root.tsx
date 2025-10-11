import { Outlet, Link, createRootRoute } from '@tanstack/react-router'
import { ResponsiveImage } from '@responsive-image/react'
import './app.css'
import { getThumbsnails } from '../images'

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
    </>
  )
}
