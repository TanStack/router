import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { ResponsiveImage } from '@responsive-image/react'
import { getThumbsnails } from '../images'
import appCss from '~/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: App,
})

function App() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
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
        <Scripts />
      </body>
    </html>
  )
}
