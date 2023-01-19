import { lazy } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';
import { createRouteConfig, Link, Outlet, useRouter } from '@tanstack/react-router';
const routeConfig = createRouteConfig({
  component: Root
});
function Root() {
  const router = useRouter();
  return <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite App</title>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{
        __html: `</script>
              ${router.options.context.head}
            <script>`
      }} />
      </head>
      <body>
        <div>
          <Link to="/" activeProps={{
          className: 'font-bold'
        }} activeOptions={{
          exact: true
        }}>
            Home
          </Link>{' '}
          <Link to="/posts" activeProps={{
          className: 'font-bold'
        }}>
            Posts
          </Link>
        </div>
        <hr />
        <Outlet />
        <TanStackRouterDevtools />
        <script type="module" src="/src/entry-client.tsx"></script>
      </body>
    </html>;
}
export { routeConfig };