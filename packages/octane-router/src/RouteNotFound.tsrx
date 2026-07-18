// Renders a route's not-found UI — the port of react-router's
// `renderRouteNotFound` (+ its `DefaultGlobalNotFound`). Resolution order matches
// upstream: the route's own `notFoundComponent`, else the router-level
// `defaultNotFoundComponent`, else TanStack's generic `<p>Not Found</p>` (the
// upstream dev-only console.warn is not ported — repo policy: functional outcomes
// only). Rendered from two places, mirroring react-router: `<Outlet/>` when its
// match is flagged `globalNotFound` (the URL matched no route), and `<Match/>`
// when the match resolved with `status === 'notFound'` (a loader threw
// `notFound()`). Upstream spreads the NotFoundError onto the component, so a
// `notFound({ data })` payload arrives as the `data` prop.
import { useRouter } from './context.ts';

export function RouteNotFound(props) @{
	const router = useRouter();
	const route = router.routesById[props.routeId];
	const NotFound = route.options.notFoundComponent ?? router.options.defaultNotFoundComponent;

	@if (NotFound) {
		<NotFound {...props.error ?? {}} />
	} @else {
		<p>Not Found</p>
	}
}
