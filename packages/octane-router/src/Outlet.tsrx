// Renders the child match below the current one. Reads the current match id from
// `matchContext`, finds the NEXT id in the match-id chain, and renders its `<Match/>`
// — the pull-based descent that replaces a top-down state diff. Renders nothing at
// a leaf.
//
// Not-found (react-router's Outlet, same order): when the URL matched no route,
// router-core flags ONE match `globalNotFound` — with the default
// `notFoundMode: 'fuzzy'` the deepest fuzzy-matched route that has children, with
// `notFoundMode: 'root'` the root. That match still renders its own component
// (the layout), and its `<Outlet/>` renders the not-found UI INSTEAD of a child
// match — so the 404 lands inside the layout chrome.
import { useContext, createElement, Suspense } from 'octane';
import { rootRouteId } from '@tanstack/router-core';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Match } from './Match.tsrx';
import { RouteNotFound } from './RouteNotFound.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';

export function Outlet() @{
	const router = useRouter();
	const parentId = useContext(matchContext);
	const parentStore = router.stores.matchStores.get(parentId);
	const parentRouteId = useStore(parentStore, (m) => m?.routeId);
	const globalNotFound = useStore(parentStore, (m) => m?.globalNotFound ?? false);
	const childId = useStore(router.stores.matchesId, (ids) => {
		const i = ids.indexOf(parentId);
		return i >= 0 ? ids[i + 1] : undefined;
	});

	// The root route's outlet wraps the first real match in a Suspense boundary
	// whose fallback is the router's defaultPendingComponent (react-router's
	// Outlet does the same) — the outermost pending UI for the initial load.
	const DefaultPending = router.options.defaultPendingComponent;
	const RootSuspense =
		parentRouteId === rootRouteId ? Suspense : SafeFragment;
	const pendingElement =
		DefaultPending ? createElement(DefaultPending, {}) : null;

	@if (globalNotFound) {
		<RouteNotFound routeId={parentRouteId} />
	} @else {
		@if (childId) {
			<RootSuspense fallback={pendingElement}>
				<Match matchId={childId} />
			</RootSuspense>
		}
	}
}
