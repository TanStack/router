// The navigation engine — port of react-router's Transitioner. It is a hook,
// rather than a component that renders nothing, because the root match can own
// the full document. A rendered sibling would put its SSR marker before <html>
// and outside the #__app hydration root.
// It (1) supplies `router.startTransition` so every navigation state update rides
// an octane transition (concurrent navigation: the current page holds while the
// next route suspends), (2) subscribes to history so back/forward and `Link`
// clicks reload the matches, (3) kicks off the initial `router.load()` (skipped
// when hydrating SSR — ssr-client triggers it) and commits a canonical-URL
// replace when the mounted URL isn't in canonical form, and (4) drives the router
// EVENT LIFECYCLE: `onLoad` when a load settles, `onBeforeRouteMount` /
// `onResolved` when all pending work (load + transition + pending matches)
// drains, then commits `status: 'idle'` + `resolvedLocation`. router-core's
// scroll restoration, devtools, and `router.subscribe` consumers all key off
// these events, and `useRouterState` selectors on `resolvedLocation` depend on
// the commit.
import { useEffect, useLayoutEffect, useRef, useState, startTransition } from 'octane';
import { batch } from '@tanstack/store';
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core';
import { useRouter } from './context.ts';
import { useStore } from './useStore.ts';
import { usePrevious } from './utils.ts';

export function useTransitioner() {
	const router = useRouter();
	const mountLoadForRouter = useRef({ router, mounted: false });
	const [isTransitioning, setIsTransitioning] = useState(false);

	const isLoading = useStore(router.stores.isLoading, (v) => v);
	const hasPending = useStore(router.stores.hasPending, (v) => v);

	const previousIsLoading = usePrevious(isLoading);
	const isAnyPending = isLoading || isTransitioning || hasPending;
	const previousIsAnyPending = usePrevious(isAnyPending);
	const isPagePending = isLoading || hasPending;
	const previousIsPagePending = usePrevious(isPagePending);

	router.startTransition = (fn) => {
		setIsTransitioning(true);
		startTransition(() => {
			fn();
			setIsTransitioning(false);
		});
	};

	// Subscribe to location changes and load the new location. On mount, also
	// verify the current URL is in canonical form (search serialization,
	// trailing slash) and replace it if not — mirroring the server-side redirect
	// check in router.beforeLoad.
	useEffect(() => {
		const unsub = router.history.subscribe(() => router.load());

		const nextLocation = router.buildLocation({
			to: router.latestLocation.pathname,
			search: true,
			params: true,
			hash: true,
			state: true,
			_includeValidateSearch: true,
		});
		if (
			trimPathRight(router.latestLocation.publicHref) !== trimPathRight(nextLocation.publicHref)
		) {
			router.commitLocation({ ...nextLocation, replace: true });
		}

		return () => unsub();
	}, [router, router.history]);

	// Initial load. Skipped when hydrating from SSR (ssr-client triggers it) and
	// on re-runs for the same router instance.
	useLayoutEffect(() => {
		if (
			typeof window !== 'undefined' && router.ssr ||
				mountLoadForRouter.current.router === router && mountLoadForRouter.current.mounted
		) {
			return;
		}
		mountLoadForRouter.current = { router, mounted: true };
		router.load().catch((err: unknown) => {
			console.error(err);
		});
	}, [router]);

	// The router was loading and now it's not — the new matches are in state.
	useLayoutEffect(() => {
		if (previousIsLoading && !isLoading) {
			router.emit({
				type: 'onLoad',
				...getLocationChangeInfo(
					router.stores.location.get(),
					router.stores.resolvedLocation.get(),
				),
			});
		}
	}, [previousIsLoading, router, isLoading]);

	useLayoutEffect(() => {
		if (previousIsPagePending && !isPagePending) {
			router.emit({
				type: 'onBeforeRouteMount',
				...getLocationChangeInfo(
					router.stores.location.get(),
					router.stores.resolvedLocation.get(),
				),
			});
		}
	}, [isPagePending, previousIsPagePending, router]);

	// Everything pending has drained — resolve the navigation: emit onResolved and
	// commit status idle + resolvedLocation (what `onRendered` and scroll
	// restoration key off).
	useLayoutEffect(() => {
		if (previousIsAnyPending && !isAnyPending) {
			const changeInfo = getLocationChangeInfo(
				router.stores.location.get(),
				router.stores.resolvedLocation.get(),
			);
			router.emit({ type: 'onResolved', ...changeInfo });

			batch(() => {
				router.stores.status.set('idle');
				router.stores.resolvedLocation.set(router.stores.location.get());
			});
		}
	}, [isAnyPending, previousIsAnyPending, router]);
}
