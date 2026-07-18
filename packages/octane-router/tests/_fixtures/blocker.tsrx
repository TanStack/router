import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	Outlet,
	useBlocker,
	MatchRoute,
	ClientOnly,
	useHydrated,
} from '@tanstack/octane-router';

function RootLayout() @{
	<div class="root">
		<MatchRoute to="/">
			<p class="mr-home">{'home matched'}</p>
		</MatchRoute>
		<MatchRoute to="/other">
			{(params) => <p class="mr-other">
				{'other:' + String(!!params)}
			</p>}
		</MatchRoute>
		<ClientOnly fallback={<p class="co-fallback">{'no js'}</p>}>
			<p class="co-content">{'client content'}</p>
		</ClientOnly>
		<Outlet />
	</div>
}

// The blocker page registers a withResolver blocker while `blockingEnabled`.
export const blockerState: { resolver: any } = { resolver: null };

function GuardedPage(props) @{
	const resolver = useBlocker({
		shouldBlockFn: () => true,
		withResolver: true,
	});
	const hydrated = useHydrated();
	blockerState.resolver = resolver;
	<p class="guarded">
		{'status:' + resolver.status + ':' + hydrated}
	</p>
}

function OtherPage() @{
	<p class="other">{'other'}</p>
}

export function makeBlockerRouter(initial: string) {
	blockerState.resolver = null;
	const rootRoute = createRootRoute({ component: RootLayout });
	const guardedRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: GuardedPage,
	});
	const otherRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'other',
		component: OtherPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([guardedRoute, otherRoute]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
