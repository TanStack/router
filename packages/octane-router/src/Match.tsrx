// Renders one route match — port of react-router's Match.tsx (MatchView +
// MatchInner + OnRendered). `Match` subscribes to the match's routeId and the
// router's `loadedAt` (the error-boundary reset key), resolves the route's
// boundary components, and composes the pipeline exactly like upstream:
//
//   Shell > matchContext > Suspense? > CatchBoundary? > CatchNotFound? > MatchInner
//
// Each boundary is only present when the route (or router defaults) configured a
// component for it — otherwise `SafeFragment` passes through so suspensions and
// errors bubble to the nearest ancestor boundary (upstream's
// ResolvedSuspenseBoundary/ResolvedCatchBoundary/ResolvedNotFoundBoundary).
// `MatchInner` handles the match STATUS: it suspends (octane `use`, upstream
// `throw promise`) on pending/redirected/_displayPending/_forcePending, renders
// the route's not-found UI for `status === 'notFound'`, throws to the
// CatchBoundary for `status === 'error'`, and otherwise renders the route
// component (or `<Outlet/>` for component-less layout routes) keyed by
// remountDeps. `OnRendered` (rendered by the match directly below the root)
// emits the router's `onRendered` event after the subtree commits — scroll
// restoration restores on it.
import { useRef, useLayoutEffect, use, createElement, Suspense } from 'octane';
import {
	createControlledPromise,
	getLocationChangeInfo,
	isNotFound,
	rootRouteId,
} from '@tanstack/router-core';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Outlet } from './Outlet.tsrx';
import { RouteNotFound } from './RouteNotFound.tsrx';
import { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx';
import { CatchNotFound } from './not-found.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';
import { ClientOnly } from './ClientOnly.tsrx';
import { ScrollRestorationScript } from './scroll-restoration.tsrx';

export function Match(props) @{
	const router = useRouter();
	const matchStore = router.stores.matchStores.get(props.matchId);
	const resetKey = useStore(router.stores.loadedAt, (l) => l);
	const matchState = useStore(
		matchStore,
		(m) => ({
			routeId: m.routeId,
			ssr: m.ssr,
			_displayPending: m._displayPending,
		}),
		(previous, next) =>
			previous.routeId === next.routeId &&
			previous.ssr === next.ssr &&
			previous._displayPending === next._displayPending,
	);
	const routeId = matchState.routeId;
	const route = router.routesById[routeId];

	const PendingComponent = route.options.pendingComponent ?? router.options.defaultPendingComponent;
	const routeErrorComponent = route.options.errorComponent ?? router.options.defaultErrorComponent;
	const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch;
	const routeNotFoundComponent = route.isRoot
		? route.options.notFoundComponent ?? router.options.notFoundRoute?.options.component
		: route.options.notFoundComponent;
	const resolvedNoSsr = matchState.ssr === false || matchState.ssr === 'data-only';

	// Boundary presence, per upstream MatchView. The root route only gets a
	// Suspense boundary when explicitly opted in via wrapInSuspense.
	const SuspenseWrap =
		(!route.isRoot || route.options.wrapInSuspense || resolvedNoSsr) &&
		(route.options.wrapInSuspense ??
			PendingComponent ??
			((route.options.errorComponent as any)?.preload || resolvedNoSsr))
			? Suspense
			: SafeFragment;
	const CatchWrap = routeErrorComponent ? CatchBoundary : SafeFragment;
	const NotFoundWrap = routeNotFoundComponent ? CatchNotFound : SafeFragment;
	const ShellComponent = route.isRoot ? route.options.shellComponent ?? SafeFragment : SafeFragment;

	const pendingElement =
		PendingComponent ? createElement(PendingComponent, {}) : null;
	const parentRouteId = route.parentRoute?.id;

	<ShellComponent>
		<matchContext.Provider value={props.matchId}>
			<SuspenseWrap fallback={pendingElement}>
				<CatchWrap
					getResetKey={() => resetKey}
					errorComponent={routeErrorComponent || ErrorComponent}
					onCatch={(error, errorInfo) => {
						if (isNotFound(error)) {
							error.routeId ??= routeId;
							throw error;
						}
						if (routeOnCatch) {
							routeOnCatch(error, errorInfo);
						}
					}}
				>
					<NotFoundWrap
						fallback={(error) => {
							error.routeId ??= routeId;

							if (
								!routeNotFoundComponent || error.routeId && error.routeId !== routeId ||
									!error.routeId && !route.isRoot
							) {
								throw error;
							}
							return createElement(routeNotFoundComponent, error);
						}}
					>
						@if (resolvedNoSsr || matchState._displayPending) {
							<ClientOnly fallback={pendingElement}>
								<MatchInner matchId={props.matchId} />
							</ClientOnly>
						} @else {
							<MatchInner matchId={props.matchId} />
						}
					</NotFoundWrap>
				</CatchWrap>
			</SuspenseWrap>
		</matchContext.Provider>
		@if (parentRouteId === rootRouteId) {
			<>
				<OnRendered />
				@if (router.options.scrollRestoration) {
					<ScrollRestorationScript />
				}
			</>
		}
	</ShellComponent>
}

function MatchInner(props) {
	const router = useRouter();
	const matchStore = router.stores.matchStores.get(props.matchId);
	const match = useStore(matchStore, (m) => m);
	const routeId = match.routeId;
	const route = router.routesById[routeId];

	// The live match in the router (if still mounted there) wins over the
	// snapshot for promise lookups, per upstream getMatchPromise.
	const getMatchPromise = (key) => router.getMatch(match.id)?._nonReactive[key] ??
		match._nonReactive[key];

	if (match._displayPending) {
		use(getMatchPromise('displayPendingPromise'));
	}

	if (match._forcePending) {
		use(getMatchPromise('minPendingPromise'));
	}

	if (match.status === 'pending') {
		// Once pending UI shows, keep it up for at least pendingMinMs.
		const pendingMinMs = route.options.pendingMinMs ?? router.options.defaultPendingMinMs;
		if (pendingMinMs) {
			const routerMatch = router.getMatch(match.id);
			if (routerMatch && !routerMatch._nonReactive.minPendingPromise) {
				const minPendingPromise = createControlledPromise();
				routerMatch._nonReactive.minPendingPromise = minPendingPromise;
				setTimeout(() => {
					minPendingPromise.resolve();
					routerMatch._nonReactive.minPendingPromise = undefined;
				}, pendingMinMs);
			}
		}
		use(getMatchPromise('loadPromise'));
	}

	if (match.status === 'notFound') {
		return createElement(RouteNotFound, { routeId, error: match.error });
	}

	if (match.status === 'redirected') {
		// Observed mid-transition while a redirect is in flight — suspend on the
		// load so this stale render is abandoned and the redirect completes.
		use(getMatchPromise('loadPromise'));
	}

	if (match.status === 'error') {
		throw match.error;
	}

	const Comp = route.options.component ?? router.options.defaultComponent;
	const remountFn = route.options.remountDeps ?? router.options.defaultRemountDeps;
	const remountDeps =
		remountFn
			? remountFn({
					routeId,
					loaderDeps: match.loaderDeps,
					params: match._strictParams,
					search: match._strictSearch,
				})
			: undefined;
	const key =
		remountDeps ? JSON.stringify(remountDeps) : undefined;
	if (Comp) {
		return createElement(Comp, key !== undefined ? { key } : {});
	}
	return createElement(Outlet, {});
}

// Emits the router's `onRendered` event once the subtree below the root layout
// has committed (this component renders as a later sibling of the match content,
// so its layout effect runs after the subtree's). Tracks the previously-resolved
// location in a ref because by effect time Transitioner has already advanced
// `resolvedLocation` to the new location.
function OnRendered() @{
	const router = useRouter();
	const prevResolvedLocationRef = useRef(undefined);
	const renderedLocationKey = useStore(
		router.stores.resolvedLocation,
		(loc) => loc?.state.__TSR_key,
	);

	useLayoutEffect(() => {
		const currentResolvedLocation = router.stores.resolvedLocation.get();
		const previousResolvedLocation = prevResolvedLocationRef.current;

		if (
			currentResolvedLocation &&
				(!previousResolvedLocation ||
					previousResolvedLocation.href !== currentResolvedLocation.href)
		) {
			router.emit({
				type: 'onRendered',
				...getLocationChangeInfo(
					router.stores.location.get(),
					previousResolvedLocation ?? currentResolvedLocation,
				),
			});
		}
		prevResolvedLocationRef.current = currentResolvedLocation;
	}, [renderedLocationKey, router]);

	<></>
}
