import { lazy } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';
import { createRouteConfig, Link, Outlet, useRouter } from '@tanstack/react-router';
const routeConfig = createRouteConfig({
  component: Root
});
function Root() {
  const router = useRouter();

  // This is weak sauce, but it's just an example.
  // In the future, we'll make meta an official thing
  // and make it async as well to support data
  const titleMatch = [...router.store.state.currentMatches].reverse().find(d => d.route.options.meta?.title);
  return <html lang="en">
      <React.StrictMode>
        <head>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>
            {titleMatch ? titleMatch.route.options.meta?.title : 'Vite App'}
          </title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script suppressHydrationWarning dangerouslySetInnerHTML={{
          __html: `</script>
              ${router.options.context.head}
            <script>`
        }} />
        </head>
        <body>
          <div className="p-2 flex gap-2 text-lg">
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
          <Outlet /> {/* Start rendering router matches */}
          <TanStackRouterDevtools position="bottom-right" />
          <script type="module" src="/src/entry-client.tsx"></script>
        </body>
      </React.StrictMode>
    </html>;
}
export { routeConfig };