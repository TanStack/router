import { lazy } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { createRouteConfig, Link, Outlet } from '@tanstack/react-router';
const routeConfig = createRouteConfig({
  component: Root
});
function Root() {
  return <>
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
    </>;
}
export { routeConfig, routeConfig as rootRoute };